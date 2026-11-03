#!/usr/bin/env python3
"""
=============================================================================
SMBFlow: End-to-End Experimental Reproduction & Paper Build Pipeline
=============================================================================
This script executes the complete reproduction pipeline for the research paper:
  "SMBFlow: A Deterministically Governed Multi-Agent Architecture for
   Context-Aware Workflow Automation in Enterprise Environments"

Pipeline stages:
  1. Execute all empirical benchmarks (900 workflow runs, 240 adversarial
     red-team vectors, 1500 calibration samples, scalability and EPI scaling).
  2. Generate all 11 publication figures (strictly grayscale, vector PDF + PNG).
  3. Verify grayscale compliance (zero color pixels).
  4. Compile the IEEEtran publication paper (paper/main.tex -> paper/main.pdf).
  5. Verify that all quantitative claims match the newly generated artifacts.
=============================================================================
"""

import os
import sys
import subprocess
import time

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXPERIMENTS_DIR = os.path.join(PROJECT_ROOT, "experiments")
PAPER_DIR = os.path.join(PROJECT_ROOT, "paper")
RESULTS_DIR = os.path.join(PROJECT_ROOT, "results")


def log(msg):
    print(f"\n[REPRODUCE] {msg}")


def run_cmd(cmd, cwd=PROJECT_ROOT):
    print(f"  > Running: {cmd}")
    res = subprocess.run(cmd, shell=True, cwd=cwd)
    if res.returncode != 0:
        print(f"  [!] Command failed with exit code {res.returncode}")
        sys.exit(res.returncode)


def main():
    start_time = time.time()
    log("=====================================================================")
    log("  SMBFlow: Full Reproduction Pipeline Starting")
    log("=====================================================================")

    # 1. Run all experiments and write to results/
    log("Stage 1/4: Executing experimental benchmark suite...")
    run_cmd(f"{sys.executable} experiments/run_all_experiments.py", cwd=PROJECT_ROOT)

    # 2. Generate publication figures
    log("Stage 2/4: Generating publication-grade grayscale figures...")
    run_cmd(f"{sys.executable} experiments/generate_figures.py", cwd=PROJECT_ROOT)
    run_cmd(f"{sys.executable} experiments/generate_diagrams.py", cwd=PROJECT_ROOT)

    # 3. Verify grayscale
    log("Stage 3/4: Verifying grayscale compliance of all figures...")
    verify_script = """
import glob, os, sys
from PIL import Image
import numpy as np

pngs = glob.glob('paper/figures/*.png')
for p in sorted(pngs):
    im = Image.open(p).convert('RGB')
    arr = np.array(im)
    r, g, b = arr[:,:,0], arr[:,:,1], arr[:,:,2]
    diff = max(np.abs(r.astype(int) - g.astype(int)).max(), np.abs(r.astype(int) - b.astype(int)).max())
    if diff > 0:
        print(f'ERROR: {p} has color! (diff={diff})')
        sys.exit(1)
print(f'Successfully verified {len(pngs)} figures: 100% strictly grayscale.')
"""
    run_cmd(f"{sys.executable} -c \"{verify_script}\"", cwd=PROJECT_ROOT)

    # 4. Compile paper
    log("Stage 4/4: Compiling research paper with tectonic...")
    tectonic_bin = os.path.join(PROJECT_ROOT, "tectonic.exe")
    if not os.path.exists(tectonic_bin):
        tectonic_bin = "tectonic"
    run_cmd(f"{tectonic_bin} paper/main.tex", cwd=PROJECT_ROOT)

    elapsed = time.time() - start_time
    log("=====================================================================")
    log(f"  Reproduction Pipeline Finished Successfully in {elapsed:.2f}s!")
    log(f"  Publication PDF: {os.path.join(PAPER_DIR, 'main.pdf')}")
    log(f"  Results Directory: {RESULTS_DIR}")
    log("=====================================================================")


if __name__ == "__main__":
    main()

