#!/usr/bin/env bash
# Make cargo work from Git Bash on Windows.
#
# Git Bash ships `/usr/bin/link.exe` (coreutils' hard-link tool). It sits ahead
# of MSVC's `link.exe` on PATH, so cargo's link step invokes the wrong program
# and dies with:
#
#     error: linking with `link.exe` failed: exit code: 1
#     note: link: missing operand after '\377\376'
#
# The `\377\376` is a UTF-8 BOM that coreutils' `link` is trying to treat as a
# file name. Prepending the MSVC toolchain fixes it for the current shell only.
#
# Usage:
#     source scripts/msvc-env.sh
#     cd src-tauri && cargo test
#
# See docs/BUILD-WINDOWS.md for the full explanation and for alternatives
# (Developer Command Prompt, vcvars64.bat).

# Adjust these two if Visual Studio or the Windows SDK is updated.
MSVC_ROOT="/c/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools/VC/Tools/MSVC/14.44.35207"
SDK_ROOT="/c/Program Files (x86)/Windows Kits/10"
SDK_VER="10.0.26100.0"

if [ ! -d "$MSVC_ROOT/bin/Hostx64/x64" ]; then
  echo "msvc-env: MSVC not found at $MSVC_ROOT" >&2
  echo "msvc-env: run 'ls \"\$(dirname \"\$MSVC_ROOT\")/..\"' to find the installed version" >&2
  return 1 2>/dev/null || exit 1
fi

# Prepend, so MSVC's link.exe wins over /usr/bin/link.exe.
export PATH="$MSVC_ROOT/bin/Hostx64/x64:$PATH"

export LIB="$(cygpath -w "$MSVC_ROOT/lib/x64");$(cygpath -w "$SDK_ROOT/Lib/$SDK_VER/ucrt/x64");$(cygpath -w "$SDK_ROOT/Lib/$SDK_VER/um/x64")"
export INCLUDE="$(cygpath -w "$MSVC_ROOT/include");$(cygpath -w "$SDK_ROOT/Include/$SDK_VER/ucrt");$(cygpath -w "$SDK_ROOT/Include/$SDK_VER/um");$(cygpath -w "$SDK_ROOT/Include/$SDK_VER/shared")"

# Incremental compilation is a large share of `target/` and buys little here.
export CARGO_INCREMENTAL=0

# Fail loudly rather than silently building against the wrong linker.
case "$(command -v link)" in
  */Hostx64/x64/link.exe) ;;
  *) echo "msvc-env: unexpected link.exe on PATH: $(command -v link)" >&2 ;;
esac
