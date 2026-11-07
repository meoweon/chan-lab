#!/bin/bash
# build.command — 双击运行：重新构建「缠论动态理论实验室」chan-lab.html
# 放在 bambuo 仓库的任何位置都可以：自动向上定位 run/05_分析工作台/cts/build.py
DIR="$(cd "$(dirname "$0")" && pwd)" || exit 1

# 按回车后关闭当前终端标签页（仅在双击运行的真实终端里生效）
press_enter_close() {
  read -r -p "按回车关闭…"
  local TTY
  TTY="$(tty)" || return 0
  case "$TTY" in
    /dev/ttys*)
      osascript -e "tell application \"Terminal\" to close (every tab of every window whose tty is \"$TTY\")" >/dev/null 2>&1
      ;;
  esac
}
CTS=""
d="$DIR"
while :; do
  if [ -f "$d/run/05_分析工作台/cts/build.py" ]; then CTS="$d/run/05_分析工作台/cts"; break; fi
  if [ -f "$d/build.py" ] && [ -f "$d/index.template.html" ]; then CTS="$d"; break; fi
  [ "$d" = "/" ] && break
  d="$(dirname "$d")"
done
if [ -z "$CTS" ]; then
  echo "[失败] 找不到 build.py：请把本文件放在 bambuo 根目录，或 run/05_分析工作台/cts 目录下"
  press_enter_close
  exit 1
fi
cd "$CTS" || exit 1
echo "▶ 构建缠论动态理论实验室 (build.py)…"
if python3 build.py; then
  echo "[完成] 构建完成 → $CTS/chan-lab.html"
else
  echo "[失败] 构建失败，请把上面的报错信息发给 meow"
  press_enter_close
  exit 1
fi
press_enter_close
