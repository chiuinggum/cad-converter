"""Independent geometric measurement of a built CadQuery solid.

This module queries the B-rep geometry directly (bounding box, cylindrical
faces, volume) instead of trusting numeric literals in the generating code.
That independence is what makes the validation table honest: the ``measured``
values come from the solid that was actually built, not from the code that was
*supposed* to build it.

The heavy CAD dependencies (``cadquery`` / ``OCP``) are imported lazily so this
module can be imported (and the pure helpers tested) in environments where the
CAD kernel is not installed.
"""

from __future__ import annotations

from math import hypot
from typing import Any


def _round(value: float, digits: int = 3) -> float:
    return round(float(value), digits)


def _cylinder_faces(solid: Any) -> list[tuple[float, tuple[float, float, float]]]:
    """Return ``(radius, (cx, cy, cz))`` for every cylindrical face.

    Returns an empty list if the OCCT bindings are unavailable or any face
    cannot be adapted, so measurement degrades gracefully to bbox-only.
    """
    try:
        from OCP.BRepAdaptor import BRepAdaptor_Surface
        from OCP.GeomAbs import GeomAbs_Cylinder
    except Exception:
        return []

    cylinders: list[tuple[float, tuple[float, float, float]]] = []
    for face in solid.Faces():
        try:
            surface = BRepAdaptor_Surface(face.wrapped)
            if surface.GetType() != GeomAbs_Cylinder:
                continue
            cylinder = surface.Cylinder()
            location = cylinder.Axis().Location()
            cylinders.append(
                (
                    _round(cylinder.Radius()),
                    (_round(location.X()), _round(location.Y()), _round(location.Z())),
                )
            )
        except Exception:
            continue
    return cylinders


def measure_solid(result: Any) -> dict[str, Any]:
    """Measure a built CadQuery result independently of its source code.

    ``result`` is a ``cadquery.Workplane`` (or anything exposing ``.val()``).
    Returns a dict with semantic hints (``_x``/``_y``/``_z``/``_volume`` and,
    when detectable, ``D_outer``/``H``/``D_bore``/``hole_dia``/``hole_pcd``)
    plus ``_values``: a deduplicated pool of every real scalar we measured.
    The diff logic in :mod:`drawing_agent.code_spec` compares drawing
    dimensions against ``_values``.
    """
    solid = result.val()
    bbox = solid.BoundingBox()
    xlen, ylen, zlen = _round(bbox.xlen), _round(bbox.ylen), _round(bbox.zlen)

    measured: dict[str, Any] = {
        "_x": xlen,
        "_y": ylen,
        "_z": zlen,
        "_volume": _round(solid.Volume()),
        "D_outer": _round(max(xlen, ylen)),
        "H": zlen,
    }

    # Candidate pool of measured scalars to diff drawing dimensions against.
    values: list[float] = [xlen, ylen, zlen]

    center_x, center_y = bbox.center.x, bbox.center.y
    cylinders = _cylinder_faces(solid)
    for radius, _ in cylinders:
        values.append(_round(radius * 2))  # diameter
        values.append(radius)  # radius (matcher also expands dia<->radius)

    if cylinders:
        # Heuristic role assignment for revolved parts: the cylinder whose axis
        # is closest to the part centre is the central bore; the rest are a
        # bolt pattern. Wrong guesses only affect the *labels*, never the pool.
        center_hole = min(
            cylinders,
            key=lambda c: (c[1][0] - center_x) ** 2 + (c[1][1] - center_y) ** 2,
        )
        measured["D_bore"] = _round(center_hole[0] * 2)

        bolts = [c for c in cylinders if c is not center_hole]
        if bolts:
            radii = sorted(b[0] for b in bolts)
            measured["hole_dia"] = _round(radii[len(radii) // 2] * 2)  # median
            pcds = sorted(
                hypot(b[1][0] - center_x, b[1][1] - center_y) for b in bolts
            )
            pcd_radius = pcds[len(pcds) // 2]  # median bolt-circle radius
            measured["hole_pcd"] = _round(pcd_radius * 2)
            values.append(measured["hole_dia"])
            values.append(measured["hole_pcd"])
            values.extend(_round(p * 2) for p in pcds)

    measured["_values"] = sorted({_round(v) for v in values if v and v > 0.05})
    return measured
