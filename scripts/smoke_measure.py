"""Smoke test for independent geometric measurement (run where cadquery exists).

Builds a known flange and prints what measure_solid() reports. Use this on the
Pro-CAD environment to verify the OCCT cylinder/bbox path before relying on the
honest validation table.

    PYTHONPATH=src python scripts/smoke_measure.py

Expected (within rounding): _x/_y ~= 80, _z ~= 20, D_bore ~= 30,
hole_dia ~= 8, hole_pcd ~= 60.
"""

import cadquery as cq

from drawing_agent.geometry import measure_solid

D_outer = 80.0
H = 20.0
D_bore = 30.0
hole_pcd = 60.0
hole_dia = 8.0

r = (
    cq.Workplane("XY")
    .circle(D_outer / 2)
    .extrude(H)
    .faces(">Z")
    .workplane()
    .hole(D_bore)
    .faces(">Z")
    .workplane()
    .polarArray(radius=hole_pcd / 2, startAngle=0, angle=360, count=4)
    .hole(hole_dia)
)

measured = measure_solid(r)
print("measured:")
for key, value in measured.items():
    print(f"  {key}: {value}")

checks = {
    "_x": D_outer,
    "_y": D_outer,
    "_z": H,
    "D_bore": D_bore,
    "hole_dia": hole_dia,
    "hole_pcd": hole_pcd,
}
print("\nchecks (tol 1.0mm):")
ok = True
for key, expected in checks.items():
    got = measured.get(key)
    passed = got is not None and abs(got - expected) <= 1.0
    ok = ok and passed
    print(f"  {key}: expected {expected}, got {got} -> {'OK' if passed else 'FAIL'}")
print("\nRESULT:", "PASS" if ok else "FAIL")
