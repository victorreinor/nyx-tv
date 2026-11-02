"""Gera o ícone do Nyx (lua crescente + estrela) em PNG, sem dependências externas.

Uso: python3 scripts/make-icon.py saida.png [tamanho]
"""
import struct
import sys
import zlib

BG = (10, 10, 18)
MOON = (142, 123, 255)
STAR = (237, 236, 246)


def coverage(x, y, size):
    """Quanto do pixel é lua/estrela (0..1), com 4×4 amostras para suavizar a borda."""
    moon = star = 0
    s = size / 24.0  # o desenho original é 24×24
    for i in range(4):
        for j in range(4):
            px = (x + (i + 0.5) / 4) / s
            py = (y + (j + 0.5) / 4) / s
            in_a = (px - 11.2) ** 2 + (py - 13.0) ** 2 <= 8.6 ** 2
            in_b = (px - 15.6) ** 2 + (py - 8.6) ** 2 <= 7.0 ** 2
            if in_a and not in_b:
                moon += 1
            if (px - 18.0) ** 2 + (py - 5.0) ** 2 <= 1.3 ** 2:
                star += 1
    return moon / 16.0, star / 16.0


def mix(a, b, t):
    return tuple(round(a[k] + (b[k] - a[k]) * t) for k in range(3))


def png(path, size=512):
    rows = []
    for y in range(size):
        row = bytearray(b"\x00")
        for x in range(size):
            m, st = coverage(x, y, size)
            c = mix(BG, MOON, m)
            c = mix(c, STAR, st)
            row += bytes(c)
        rows.append(bytes(row))

    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(b"".join(rows), 9)) + chunk(b"IEND", b""))


if __name__ == "__main__":
    png(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 512)
