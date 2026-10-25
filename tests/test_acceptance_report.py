"""Tests for Item 5: Programmatic generation of reports/final_acceptance_report.md from simulation.json and benchmarks.json."""

import copy
import importlib.util
import json
from pathlib import Path
import pytest

ROOT_DIR = Path(__file__).resolve().parent.parent
SIM_JSON_PATH = ROOT_DIR / "results" / "simulation.json"
BENCH_JSON_PATH = ROOT_DIR / "reports" / "benchmarks.json"
REPORT_MD_PATH = ROOT_DIR / "reports" / "final_acceptance_report.md"


def test_acceptance_report_generated_from_files_and_matches_numbers(tmp_path: Path):
    """Verify py/generate_acceptance_report.py generates final_acceptance_report.md matching simulation.json and benchmarks.json."""
    gen_path = ROOT_DIR / "backend" / "py" / "generate_acceptance_report.py"
    assert gen_path.is_file(), f"Missing {gen_path}"

    spec = importlib.util.spec_from_file_location("generate_acceptance_report", gen_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    sim_data = json.loads(SIM_JSON_PATH.read_text(encoding="utf-8"))
    bench_data = json.loads(BENCH_JSON_PATH.read_text(encoding="utf-8"))

    out_md = tmp_path / "final_acceptance_report.md"
    report_text = mod.generate_acceptance_report(
        simulation_json_path=SIM_JSON_PATH,
        benchmarks_json_path=BENCH_JSON_PATH,
        output_md_path=out_md,
    )
    assert out_md.is_file()
    disk_report = REPORT_MD_PATH.read_text(encoding="utf-8")
    assert report_text == disk_report

    # Compare key numbers in report_text against simulation.json
    ms = sim_data["mission_summary"]
    tb = sim_data["thrust_budget"]
    val = sim_data["validation"]

    assert sim_data["status"] in report_text
    assert f"{ms['arrival_year']:.2f}" in report_text
    assert f"{ms['total_simulation_years']:.2f}" in report_text
    assert f"{ms['final_semi_major_axis_au']:.4f}" in report_text
    assert f"{ms['final_eccentricity']:.6f}" in report_text
    assert f"{ms['total_propellant_kg']:.4e}" in report_text
    assert f"{ms['propellant_fraction_ceres'] * 100.0:.2f}%" in report_text
    assert f"{ms['relativistic_jet_power_w']:.4e}" in report_text
    assert f"{tb['nominal_engine_thrust_n']:.4e}" in report_text
    assert f"{tb['effective_tangential_thrust_n']:.4e}" in report_text
    assert f"{tb['gravitational_coupling_pull_n']:.4e}" in report_text
    assert f"{tb['photon_radiation_pressure_force_n']:.4e}" in report_text
    assert f"{tb['yaw_trim_angle_deg']:.4f}" in report_text
    assert f"{val['details']['min_structural_safety_factor']:.2f}" in report_text
    assert f"{val['details']['required_safety_factor']:.2f}" in report_text

    # Compare all 10 benchmarks in report_text against reports/benchmarks.json
    assert f"{bench_data['passed_count']}/{bench_data['total_count']}" in report_text
    for b in bench_data["benchmarks"]:
        assert b["name"] in report_text
        assert b["computed"] in report_text
        assert b["source_page"] in report_text

    # Verify dynamic generation (no hand-typed numbers): Perturb sim_data in tmp_path and check report updates
    perturbed_sim = copy.deepcopy(sim_data)
    perturbed_sim["mission_summary"]["arrival_year"] = 8123.45
    perturbed_sim["mission_summary"]["final_eccentricity"] = 0.004321
    perturbed_sim_path = tmp_path / "sim_perturbed.json"
    perturbed_sim_path.write_text(json.dumps(perturbed_sim), encoding="utf-8")

    perturbed_md = mod.generate_acceptance_report(
        simulation_json_path=perturbed_sim_path,
        benchmarks_json_path=BENCH_JSON_PATH,
        output_md_path=tmp_path / "perturbed_report.md",
    )
    assert "8123.45" in perturbed_md
    assert "0.004321" in perturbed_md
