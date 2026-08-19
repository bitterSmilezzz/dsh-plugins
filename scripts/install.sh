#!/usr/bin/env bash
# install.sh — deepseek-plugins 一键安装脚本
#
# 用法：
#   bash scripts/install.sh                                     # 安装全部插件到 web profile
#   bash scripts/install.sh --all                               # 同上（默认）
#   bash scripts/install.sh --only dsh-essentials,dsh-memory    # 只装指定插件
#   bash scripts/install.sh --only dsh-dev                      # 只装技能包（复制到 ~/.agents/skills）
#   bash scripts/install.sh --external                          # 外部浏览器组件
#   bash scripts/install.sh -p headless --all                   # 指定 profile
#   bash scripts/install.sh -p web --dsh "pnpm --dir /path/to/harness dsh" --dry-run
#
# 说明：
# - 安装来源以 plugins.json 清单为真相：所有插件（source=github）从独立仓库 GitHub 直装。
# - 纯技能包（dsh-dev/dsh-writing/dsh-design）由本脚本 clone 后复制到 ~/.agents/skills。
# - preset（router-standard/liangshen）随 dsh-essentials 源码复制到 ~/.dsh/.agent-presets。

set -euo pipefail

PROFILE="web"
MODE="all"
ONLY=""
DSH_CMD=("dsh")
DRY_RUN=false
APPLY_SETTINGS=false
DO_EXTERNAL=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    -p|--profile) PROFILE="$2"; shift 2 ;;
    --all) MODE="all"; shift ;;
    --only) MODE="only"; ONLY="$2"; shift 2 ;;
    --external) DO_EXTERNAL=true; MODE="external"; shift ;;
    --dsh) IFS=' ' read -ra DSH_CMD <<< "$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --apply-settings) APPLY_SETTINGS=true; shift ;;
    -h|--help)
      cat <<'EOF'
用法: bash scripts/install.sh [--profile <name>] [--all|--only <id,...>] [--external] [--dsh "cmd"] [--dry-run] [--apply-settings]

模式:
  --all            安装全部插件（默认）：全部 bundle + 全部技能包 + preset
  --only <id,...>  只安装指定插件（bundle 走 dsh plugin add，技能包复制 skills）

选项:
  --external       执行外部浏览器组件安装（BrowserSkill + Chrome 扩展）
  --apply-settings 安装后交互合并 config/settings.example.yaml 到 DSH settings.yaml（先备份）
EOF
      exit 0 ;;
    *) echo "未知参数: $1（--help 查看用法）"; exit 1 ;;
  esac
done

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DSH_HOME_DIR="${DSH_HOME:-$HOME/.dsh}"
SKILLS_DIR="${SKILLS_DIR:-$HOME/.agents/skills}"
PRESETS_DIR="$DSH_HOME_DIR/.agent-presets"

echo "📦 deepseek-plugins 安装"
echo "   Profile:   $PROFILE"
echo "   模式:      ${MODE}${ONLY:+ ($ONLY)}"
echo "   仓库路径:  $REPO_DIR"
echo "   dsh 命令:  ${DSH_CMD[*]}"
echo ""

# 检测 dsh 是否可用（dry-run/纯技能包/外部场景不强制）
if ! $DRY_RUN && ! $DO_EXTERNAL && [ "$MODE" = "all" ]; then
  if ! command -v "${DSH_CMD[0]}" &>/dev/null; then
    if [ "${DSH_CMD[0]}" = "dsh" ]; then
      echo "❌ dsh 不在 PATH 中。请指定 --dsh，例如："
      echo "   bash scripts/install.sh --dsh \"pnpm --dir /path/to/deepseek-harness dsh\""
      exit 1
    fi
  fi
fi

# 检查 profile 目录（不存在则由首个 dsh plugin add 自动初始化）
PROFILE_DIR="$DSH_HOME_DIR/profiles/$PROFILE"
if [ ! -d "$PROFILE_DIR" ]; then
  echo "   [info] Profile 目录不存在: ${PROFILE_DIR}（将由首个 dsh plugin add 自动初始化）"
fi

echo "🔧 检测并放行构建脚本（node-pty / protobufjs）..."
if [ -f "$PROFILE_DIR/pnpm-workspace.yaml" ]; then
  if ! grep -q "node-pty" "$PROFILE_DIR/pnpm-workspace.yaml" 2>/dev/null; then
    if $DRY_RUN; then
      echo "   [dry-run] 在 profile pnpm-workspace.yaml 添加 allowBuilds"
    else
      cat >> "$PROFILE_DIR/pnpm-workspace.yaml" <<'EOF'
allowBuilds:
  node-pty: true
  protobufjs: true
EOF
      echo "   ✔ 已放行"
    fi
  else
    echo "   ✔ 已放行（跳过）"
  fi
fi

# 解析插件安装来源：按 plugins.json 清单输出 github spec（含 &path:/ 子目录）
resolve_spec() {
  local id="$1"
  local out
  out="$(node "$REPO_DIR/scripts/plugin-manifest.mjs" get "$id" 2>/dev/null)" || { echo ""; return 1; }
  echo "$out" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).spec))"
}

# 目标插件列表：--all 取清单全部 bundle；--only 取指定 id（含技能包）
TARGET_BUNDLES=""
TARGET_SKILLS=""
if [ "$MODE" = "all" ]; then
  TARGET_BUNDLES="$(node "$REPO_DIR/scripts/plugin-manifest.mjs" list | awk -F'\t' '$2=="bundle"{printf "%s ", $1}')"
  TARGET_SKILLS="$(node "$REPO_DIR/scripts/plugin-manifest.mjs" list | awk -F'\t' '$2=="skills"{printf "%s ", $1}')"
else
  for id in $(echo "$ONLY" | tr ',' ' '); do
    type="$(node "$REPO_DIR/scripts/plugin-manifest.mjs" get "$id" 2>/dev/null | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).type)}catch(e){console.log('')}})")"
    if [ "$type" = "skills" ]; then TARGET_SKILLS="$TARGET_SKILLS $id"; else TARGET_BUNDLES="$TARGET_BUNDLES $id"; fi
  done
fi

# 安装真 bundle
if [ -n "$TARGET_BUNDLES" ]; then
  echo ""
  echo "📦 安装 bundle 到 profile $PROFILE ..."
  for rel in $TARGET_BUNDLES; do
    spec="$(resolve_spec "$rel")"
    if [ -z "$spec" ]; then
      echo "   ⚠ 跳过未登记插件: ${rel}（plugins.json 未登记）"
      continue
    fi
    if $DRY_RUN; then
      echo "   [dry-run] ${DSH_CMD[*]} plugin --profile $PROFILE add $spec"
    else
      echo "   === 安装 ${rel}（${spec}）==="
      if "${DSH_CMD[@]}" plugin --profile "$PROFILE" add "$spec"; then
        echo "   ✔ $rel 安装成功"
      else
        echo "   ✘ $rel 安装失败"
        exit 1
      fi
    fi
  done
fi

# 获取插件源码目录：本地优先（过渡期），否则从 plugins.json 的 github 源 clone 到缓存
PLUGIN_CACHE="$DSH_HOME_DIR/plugin-cache"

ensure_source() {
  local id="$1"
  # 本地目录优先（开发/过渡期）：汇总仓库内 或 ~/workspace/<repo>/<子包>
  if [ -d "$REPO_DIR/$id" ]; then
    echo "$REPO_DIR/$id"
    return 0
  fi
  local spec repo
  spec="$(node "$REPO_DIR/scripts/plugin-manifest.mjs" get "$id" 2>/dev/null)" || { echo ""; return 1; }
  repo="$(echo "$spec" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.source==='github'?j.spec:'')})")"
  if [ -z "$repo" ]; then
    echo ""
    return 1
  fi
  # 本地 workspace 优先：~/workspace/<repo 短名>/<path 子包>
  local repo_short path_sub local_ws
  repo_short="$(echo "$repo" | sed -E 's|^github:[^/]+/([^#&]+).*|\1|')"
  path_sub="$(echo "$repo" | sed -n 's/.*&path:\([^&]*\).*/\1/p')"
  local_ws="$HOME/workspace/$repo_short${path_sub}"
  if [ -d "$local_ws" ]; then
    echo "$local_ws"
    return 0
  fi
  # 按清单 github 源 clone 到缓存（支持 &path:/ 子目录：返回 cache/<path>）
  local clone_url subpath
  subpath="$path_sub"
  clone_url="$(echo "$repo" | sed -E 's|^github:([^#&]+)([#&].*)?$|https://github.com/\1.git|')"
  local cache_dir="$PLUGIN_CACHE/$id"
  if [ -d "$cache_dir/.git" ]; then
    echo "$cache_dir${subpath}"
    return 0
  fi
  echo "   [info] clone 插件源码: ${clone_url} → ${cache_dir}" >&2
  if $DRY_RUN; then
    echo "   [dry-run] git clone $clone_url $cache_dir"
    echo ""
    return 1
  fi
  mkdir -p "$PLUGIN_CACHE"
  if git clone --quiet "$clone_url" "$cache_dir" 2>/dev/null; then
    echo "$cache_dir${subpath}"
  else
    echo ""
    return 1
  fi
}

# 复制纯技能包
if [ -n "$TARGET_SKILLS" ]; then
  echo ""
  echo "🧩 复制 skills 到 $SKILLS_DIR ..."
  for pack in $TARGET_SKILLS; do
    src="$(ensure_source "$pack")"
    if [ -z "$src" ]; then
      echo "   ⚠ 无法获取技能包源码: $pack"
      continue
    fi
    src="$src/skills"
    [ -d "$src" ] || { echo "   ⚠ 无 skills 目录: $pack"; continue; }
    for skill_dir in "$src"/*/; do
      [ -d "$skill_dir" ] || continue
      name="$(basename "$skill_dir")"
      target="$SKILLS_DIR/$name"
      if $DRY_RUN; then
        echo "   [dry-run] 安装 skill: ${name}（来自 ${pack}）"
        continue
      fi
      if [ -d "$target" ]; then
        if diff -rq "$skill_dir" "$target" >/dev/null 2>&1; then
          echo "   ✔ $name 已存在且一致（跳过）"
        else
          echo "   ⚠ 同名 skill ${name} 内容不一致（来自 ${pack}）"
          read -r -p "      覆盖? [y/N] " ans
          if [[ "$ans" == "y" || "$ans" == "Y" ]]; then
            rm -rf "$target"
            cp -R "$skill_dir" "$target"
            echo "   ✔ $name 已覆盖"
          else
            echo "   ↷ $name 保留现有版本"
          fi
        fi
      else
        mkdir -p "$SKILLS_DIR"
        cp -R "$skill_dir" "$target"
        echo "   ✔ $name 已安装"
      fi
    done
  done
fi

# 复制预设（--all 模式：preset 随 essentials 源码复制；--only dsh-essentials 也复制）
if [ "$MODE" = "all" ] || echo "$ONLY" | grep -q "dsh-essentials"; then
  echo ""
  echo "🎛 复制 presets 到 $PRESETS_DIR ..."
  essentials_src="$(ensure_source dsh-essentials)"
  if [ -z "$essentials_src" ]; then
    echo "   ⚠ 无法获取 dsh-essentials 源码（preset 来源）"
  else
    preset_root="$essentials_src/preset"
    if [ -d "$preset_root" ]; then
      for preset_dir in "$preset_root"/*/; do
        [ -d "$preset_dir" ] || continue
        name="$(basename "$preset_dir")"
        target="$PRESETS_DIR/$name"
        if $DRY_RUN; then
          echo "   [dry-run] 安装 preset: $name"
          continue
        fi
        mkdir -p "$PRESETS_DIR"
        rm -rf "$target"
        cp -R "$preset_dir" "$target"
        echo "   ✔ $name 已更新"
      done
    else
      echo "   ⚠ dsh-essentials 无 preset 目录"
    fi
  fi
fi

# 外部浏览器组件 + skill
if $DO_EXTERNAL; then
  echo ""
  echo "🌐 外部浏览器组件（BrowserSkill + Chrome 扩展）"
  if $DRY_RUN; then
    echo "   [dry-run] node scripts/install-external.mjs --component browser-skill --dry-run"
  else
    node scripts/install-external.mjs --component browser-skill
  fi
  # 复制 BrowserSkill 纯技能包
  browser_skill_src="$REPO_DIR/external/browser-skill"
  if [ -d "$browser_skill_src" ]; then
    for skill_dir in "$browser_skill_src"/*/; do
      [ -d "$skill_dir" ] || continue
      name="$(basename "$skill_dir")"
      target="$SKILLS_DIR/$name"
      if $DRY_RUN; then
        echo "   [dry-run] 安装 skill: ${name}（来自 external/browser-skill）"
        continue
      fi
      mkdir -p "$SKILLS_DIR"
      if [ -d "$target" ]; then
        if diff -rq "$skill_dir" "$target" >/dev/null 2>&1; then
          echo "   ✔ $name 已存在且一致（跳过）"
        else
          rm -rf "$target"
          cp -R "$skill_dir" "$target"
          echo "   ✔ $name 已更新"
        fi
      else
        cp -R "$skill_dir" "$target"
        echo "   ✔ $name 已安装"
      fi
    done
  fi
fi

# settings 交互合并
if $APPLY_SETTINGS; then
  echo ""
  echo "⚙️ 应用脱敏 settings 模板..."
  if $DRY_RUN; then
    echo "   [dry-run] node scripts/apply-settings.mjs --dry-run"
  else
    node scripts/apply-settings.mjs
  fi
fi

echo ""
if $DRY_RUN; then
  echo "（--dry-run 完成，未实际安装）"
  exit 0
fi
echo "✅ 安装完成（${MODE}${ONLY:+: $ONLY}）"
echo ""
echo "接下来："
echo "   1. 硬刷新浏览器（Cmd/Ctrl+Shift+R）"
echo "   2. 如果 host 半改动，重启 dsh 进程"
