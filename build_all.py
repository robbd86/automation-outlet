#!/usr/bin/env python3
"""Run the existing AO build steps in their original order.

The single entry point keeps vercel.json under Vercel's 256-character buildCommand limit.
Do not skip steps: SEO, logo finalisation and privacy/sitemap policies are applied last.
"""
from pathlib import Path
import subprocess
import sys

ROOT=Path(__file__).resolve().parent
STEPS=(
    "build.py",
    "patch_stock.py",
    "patch_network.py",
    "patch_conversion.py",
    "pct.py",
    "patch_seo.py",
    "patch_growth.py",
    "patch_logo.py",
    "patch_exact_logo.py",
    "finalise_logo.py",
    "patch_analytics.py",
    "patch_audience_growth.py",
    "release.py",
)

def main():
    for step in STEPS:
        print(f"AO BUILD: {step}",flush=True)
        subprocess.run([sys.executable,str(ROOT/step)],cwd=ROOT,check=True)

if __name__=="__main__":
    main()
