"""Create a small synthetic surface with a visible localized depression."""

from math import cos, exp, pi, sin
from pathlib import Path


def make_obj():
    latitudes, longitudes = 52, 96
    lines = ["# Synthetic research example: textured closed surface with one dent", "o sample_surface"]
    for i in range(latitudes + 1):
        theta = pi * i / latitudes
        for j in range(longitudes):
            phi = 2 * pi * j / longitudes
            detail = 0.035 * sin(7 * phi + 2 * theta) * sin(3 * theta)
            ridge = 0.045 * sin(11 * phi) * sin(theta) ** 4
            angular_distance = min(abs(phi - 1.25), 2 * pi - abs(phi - 1.25))
            dent = 0.23 * exp(-((theta - 1.14) / 0.21) ** 2 - (angular_distance / 0.26) ** 2)
            radius = 1 + detail + ridge - dent
            x = 1.11 * radius * sin(theta) * cos(phi)
            y = 0.93 * radius * cos(theta)
            z = 0.88 * radius * sin(theta) * sin(phi)
            lines.append(f"v {x:.6f} {y:.6f} {z:.6f}")
    for i in range(latitudes):
        for j in range(longitudes):
            a = i * longitudes + j + 1
            b = i * longitudes + (j + 1) % longitudes + 1
            c = (i + 1) * longitudes + j + 1
            d = (i + 1) * longitudes + (j + 1) % longitudes + 1
            if i > 0:
                lines.append(f"f {a} {c} {b}")
            if i < latitudes - 1:
                lines.append(f"f {b} {c} {d}")
    return "\n".join(lines) + "\n"


def make_stl():
    vertices = [
        (-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1),
        (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1),
    ]
    faces = [
        (0, 2, 1), (0, 3, 2), (4, 5, 6), (4, 6, 7),
        (0, 1, 5), (0, 5, 4), (3, 7, 6), (3, 6, 2),
        (0, 4, 7), (0, 7, 3), (1, 2, 6), (1, 6, 5),
    ]
    lines = ["solid demo_cube"]
    for a, b, c in faces:
        p, q, r = vertices[a], vertices[b], vertices[c]
        u = [q[k] - p[k] for k in range(3)]
        v = [r[k] - p[k] for k in range(3)]
        normal = (u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])
        lines.append(f"  facet normal {normal[0]} {normal[1]} {normal[2]}")
        lines.append("    outer loop")
        for vertex in (p, q, r):
            lines.append(f"      vertex {vertex[0]} {vertex[1]} {vertex[2]}")
        lines.extend(["    endloop", "  endfacet"])
    lines.append("endsolid demo_cube")
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    destination = Path(__file__).resolve().parents[1] / "public" / "sample-surface.obj"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(make_obj())
    print(destination)
    stl_destination = destination.parents[1] / "samples" / "demo-cube.stl"
    stl_destination.parent.mkdir(parents=True, exist_ok=True)
    stl_destination.write_text(make_stl())
    print(stl_destination)
