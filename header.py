import os
import sys

# Copyright header cho từng loại file
HEADERS = {
    '.py': """\
# Copyright (c) 2026 Hữu Hoà <nguyenhuuhoa@proton.me>
# SPDX-License-Identifier: MIT
# Derived from: https://github.com/kyle6317/examaplus
""",
    '.html': """\
<!--
  Copyright (c) 2026 Hữu Hoà <nguyenhuuhoa@proton.me>
  SPDX-License-Identifier: MIT
  Derived from: https://github.com/kyle6317/examaplus
-->
""",
    '.ts': """\
// Copyright (c) 2026 Hữu Hoà <nguyenhuuhoa@proton.me>
// SPDX-License-Identifier: MIT
// Derived from: https://github.com/kyle6317/examaplus
""",
    '.js': """\
// Copyright (c) 2026 Hữu Hoà <nguyenhuuhoa@proton.me>
// SPDX-License-Identifier: MIT
// Derived from: https://github.com/kyle6317/examaplus
""",
    '.sql': """\
-- Copyright (c) 2026 Hữu Hoà <nguyenhuuhoa@proton.me>
-- SPDX-License-Identifier: MIT
-- Derived from: https://github.com/kyle6317/examaplus
""",
}

EXTENSIONS = set(HEADERS.keys())


def already_has_header(content: str) -> bool:
    """Kiểm tra file đã có header copyright chưa."""
    return "Copyright (c) 2026 Hữu Hoà" in content[:500]


def insert_header(filepath: str, ext: str, dry_run: bool = False) -> str:
    """Chèn header vào đầu file, giữ shebang nếu có."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    if already_has_header(content):
        return "skip"

    header = HEADERS[ext]
    lines = content.splitlines(keepends=True)

    # Giữ shebang (#!) ở dòng đầu nếu có (chỉ áp dụng cho .py / .js)
    if lines and lines[0].startswith('#!'):
        new_content = lines[0] + '\n' + header + ''.join(lines[1:])
    else:
        new_content = header + '\n' + content

    if not dry_run:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)

    return "done"


def process_directory(root_dir: str, dry_run: bool = False):
    inserted = []
    skipped = []
    errors = []

    for dirpath, dirnames, filenames in os.walk(root_dir):
        # Bỏ qua các thư mục ẩn và node_modules / __pycache__
        dirnames[:] = [
            d for d in dirnames
            if not d.startswith('.') and d not in ('node_modules', '__pycache__', '.git', 'venv', '.venv')
        ]

        for filename in filenames:
            _, ext = os.path.splitext(filename)
            if ext not in EXTENSIONS:
                continue

            filepath = os.path.join(dirpath, filename)
            try:
                result = insert_header(filepath, ext, dry_run=dry_run)
                if result == "done":
                    inserted.append(filepath)
                else:
                    skipped.append(filepath)
            except Exception as e:
                errors.append((filepath, str(e)))

    return inserted, skipped, errors


def main():
    dry_run = '--dry-run' in sys.argv
    root = '.'

    print(f"{'[DRY RUN] ' if dry_run else ''}Quét thư mục: {os.path.abspath(root)}\n")

    inserted, skipped, errors = process_directory(root, dry_run=dry_run)

    if inserted:
        label = "Sẽ chèn" if dry_run else "Đã chèn"
        print(f"✅ {label} header ({len(inserted)} file):")
        for f in inserted:
            print(f"   + {f}")

    if skipped:
        print(f"\n⏭️  Bỏ qua (đã có header) ({len(skipped)} file):")
        for f in skipped:
            print(f"   ~ {f}")

    if errors:
        print(f"\n❌ Lỗi ({len(errors)} file):")
        for f, e in errors:
            print(f"   ! {f}: {e}")

    print(f"\nTổng: {len(inserted)} chèn, {len(skipped)} bỏ qua, {len(errors)} lỗi.")


if __name__ == '__main__':
    main()