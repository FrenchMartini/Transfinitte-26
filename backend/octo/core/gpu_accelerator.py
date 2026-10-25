"""GPU Acceleration module for OrbitShift multi-physics simulation.

Provides CUDA-accelerated N-body force evaluation, coordinate transforms, and kinematic integration
on NVIDIA GPUs (e.g. RTX 5060) using Numba CUDA kernels.
"""

from typing import Any
import numpy as np

try:
    from numba import cuda
    HAS_CUDA = cuda.is_available()
except (ImportError, Exception):
    HAS_CUDA = False


def get_gpu_info() -> dict[str, Any]:
    """Return hardware specs of the available NVIDIA GPU."""
    if not HAS_CUDA:
        return {
            "available": False,
            "device_name": "None (CUDA not available)",
            "memory_total_mb": 0,
            "compute_capability": (0, 0),
        }
    try:
        gpu = cuda.get_current_device()
        name = gpu.name.decode("utf-8") if isinstance(gpu.name, bytes) else str(gpu.name)
        mem_total = 0
        try:
            mem_info = cuda.current_context().get_memory_info()
            mem_total = mem_info.total // (1024 * 1024)
        except Exception:
            pass
        return {
            "available": True,
            "device_name": name,
            "memory_total_mb": mem_total,
            "compute_capability": gpu.compute_capability,
        }
    except Exception as exc:
        return {
            "available": False,
            "device_name": f"Error querying device: {exc}",
            "memory_total_mb": 0,
            "compute_capability": (0, 0),
        }


if HAS_CUDA:
    @cuda.jit
    def nbody_acceleration_kernel(positions, masses, g_const, out_accel):
        """CUDA kernel computing mutual gravitational accelerations across N bodies."""
        i = cuda.grid(1)
        n = positions.shape[0]
        if i < n:
            ax = 0.0
            ay = 0.0
            az = 0.0
            xi = positions[i, 0]
            yi = positions[i, 1]
            zi = positions[i, 2]
            for j in range(n):
                if i != j:
                    dx = positions[j, 0] - xi
                    dy = positions[j, 1] - yi
                    dz = positions[j, 2] - zi
                    dist_sq = dx * dx + dy * dy + dz * dz + 1.0e-20
                    dist = dist_sq ** 0.5
                    inv_cube = 1.0 / (dist * dist_sq)
                    factor = g_const * masses[j] * inv_cube
                    ax += factor * dx
                    ay += factor * dy
                    az += factor * dz
            out_accel[i, 0] = ax
            out_accel[i, 1] = ay
            out_accel[i, 2] = az

    @cuda.jit
    def batch_spiral_kinematics_kernel(r_arr, m_sun, m_earth, g_const, dt, f_eff, out_dr, out_dv):
        """CUDA kernel computing secular orbital expansion increments in parallel for time arrays."""
        idx = cuda.grid(1)
        if idx < r_arr.shape[0]:
            r = r_arr[idx]
            v = (g_const * (m_sun + m_earth) / r) ** 0.5
            a_eff = f_eff / m_earth
            # dr/dt = 2 * a_eff / omega = 2 * a_eff * r / v
            dr_dt = 2.0 * a_eff * r / v
            dv_dt = -0.5 * v / r * dr_dt
            out_dr[idx] = dr_dt * dt
            out_dv[idx] = dv_dt * dt


def compute_gpu_accelerated_nbody_forces(
    positions_m: np.ndarray,
    masses_kg: np.ndarray,
    g_const: float,
) -> np.ndarray:
    """Compute mutual gravitational accelerations using NVIDIA GPU CUDA kernel."""
    if not HAS_CUDA:
        # Vectorized CPU fallback
        n = positions_m.shape[0]
        accel = np.zeros_like(positions_m)
        for i in range(n):
            for j in range(n):
                if i != j:
                    diff = positions_m[j] - positions_m[i]
                    dist = float(np.linalg.norm(diff)) + 1.0e-20
                    accel[i] += (g_const * masses_kg[j] / (dist ** 3)) * diff
        return accel

    n = positions_m.shape[0]
    d_pos = cuda.to_device(positions_m.astype(np.float64))
    d_mass = cuda.to_device(masses_kg.astype(np.float64))
    d_accel = cuda.device_array((n, 3), dtype=np.float64)

    threads_per_block = 32
    blocks = (n + threads_per_block - 1) // threads_per_block
    nbody_acceleration_kernel[blocks, threads_per_block](d_pos, d_mass, g_const, d_accel)

    return d_accel.copy_to_host()
