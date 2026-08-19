/**
 * dsh-ui-tweaks — browser half (merged + refactored bundle).
 *
 * 从 dsh-notify + dsh-ui-tweaks 合并重构而来：
 * - 统一 locale 命名空间（NS = 'ui-tweaks'），替代合并前 6 个散落的 NS
 * - 统一配置对象（localStorage key 'dsh-ui-tweaks.settings'），替代合并前 3 个散落的 storage key
 * - 通用设置下挂一个「界面增强」总入口（settings.general.item，id=ui-tweaks），
 *   展开后内部分组展示全部功能开关/选项
 * - 三个同构开关（auto-hide / immersive / shortcuts）抽成统一 ToggleCard
 * - notify（桌面通知）作为独立子模块并入：sessions 监听 + 四类事件开关 + 权限行
 * - plugin-inventory 保留插件设置 tab（受开关控制，默认开）
 * - retry-settings 保留 host 路由（/api/retry-settings）+ 通用设置里的次数输入
 *
 * 所有副作用挂在同一 fiber：ctx.effect / ctx.slots.inject 随插件卸载全部回收。
 * 只走官方扩展点：settings.general.item / settings.plugins.tab / webServer 路由。
 */
window.__ModuleLoader__.load({
  id: 'dsh-ui-tweaks',
  factory: (require) => {
    let react_jsx_runtime = require('react/jsx-runtime')
    let react = require('react')
    let primitives = require('@deepseek-ai/dsh-client-ui-primitives')

    // ── 统一 locale 命名空间 ──────────────────────────────────────────
    const NS = 'ui-tweaks'
    const zh = {
      masterTitle: '界面增强',
      masterDesc: 'UI 微调与桌面通知：插件列表、输入框、沉浸、快捷键、重试、通知',
      groupGeneral: '通用',
      groupImmersive: '沉浸',
      groupComposer: '输入框',
      groupNotify: '桌面通知',
      groupRetry: '请求重试',
      pluginInventoryTitle: '插件列表增强',
      pluginInventoryDesc: '插件列表分类 tab（全部/内置/自定义）+ 搜索',
      autoHideTitle: '输入框自动隐藏',
      autoHideDesc: '鼠标离开对话底部后隐藏输入框，贴近底边或聚焦时恢复',
      autoHideDelay: '隐藏延迟 (ms)',
      autoHideThreshold: '底部触发距离 (px)',
      immersiveTitle: '沉浸模式',
      immersiveDesc: '隐藏侧栏/详情/会话头，对话铺满页面；右下角悬浮按钮随时切换',
      immersiveEnter: '进入沉浸',
      immersiveExit: '退出沉浸',
      keyboardTitle: '全局快捷键',
      keyboardDesc: '沉浸切换 / 自动隐藏切换 / 聚焦输入框 / 快捷键帮助等',
      keyboardHint: '按 ? 或 Ctrl+/ 随时查看快捷键帮助。',
      retryTitle: '请求重试',
      retryDesc: '模型请求失败重试次数',
      retryCurrent: '当前生效',
      retryMixed: '各提供商不一致',
      retrySave: '保存',
      retrySaving: '保存中…',
      retrySaved: '已保存',
      retryLoadFailed: '读取失败',
      retrySaveFailed: '保存失败',
      retryInputHint: '模型请求失败后的重试次数（0 = 不重试，默认 2）。保存后应用到所有已配置的 LLM 提供商。',
      retryProviders: '已应用到 {n} 个提供商',
      notifyTitle: '桌面通知',
      notifyDesc: '你在其他标签页时弹出系统通知',
      notifyApproval: '需要审批时提醒',
      notifyQuestion: '需要回答时提醒',
      notifyTurn: '轮次完成时提醒',
      notifySessionDone: '后台会话完成时提醒',
      notifyApprovalTitle: '需要审批',
      notifyApprovalBody: '工具 {toolName} 请求越权执行',
      notifyQuestionTitle: '需要你的回答',
      notifyQuestionBody: 'Agent 有一个问题需要你回答',
      notifyTurnTitle: '轮次完成',
      notifyTurnBody: '第 {turn} 轮已完成',
      notifySessionDoneTitle: '会话完成',
      notifySessionDoneBody: '该会话已完成，可以切回查看',
      notifyPermission: '通知权限',
      notifyPermissionGranted: '已开启',
      notifyPermissionDenied: '已被浏览器阻止',
      notifyPermissionDefault: '未授权',
      notifyPermissionUnsupported: '浏览器不支持',
      notifyRequest: '开启桌面通知',
      toastOn: '已开启',
      toastOff: '已关闭',
      close: '关闭',
      keys: {
        help: '打开/关闭快捷键帮助',
        escape: '关闭帮助面板',
        immersive: '切换沉浸模式',
        autoHide: '切换输入框自动隐藏',
        focusComposer: '聚焦聊天输入框',
        sidebar: '切换侧边栏',
        newChat: '新建会话',
        settings: '打开设置',
        usage: '打开用量统计',
        plugins: '打开插件设置',
        scrollBottom: '滚动到底部',
        scrollTop: '滚动到顶部',
      },
    }
    const en = {
      masterTitle: 'UI Enhancements',
      masterDesc: 'UI tweaks & desktop notifications: plugins, composer, immersive, shortcuts, retries, notify',
      groupGeneral: 'General',
      groupImmersive: 'Immersive',
      groupComposer: 'Composer',
      groupNotify: 'Desktop notifications',
      groupRetry: 'Request retries',
      pluginInventoryTitle: 'Plugin list enhancement',
      pluginInventoryDesc: 'Categorized plugin tabs (all/builtin/custom) + search',
      autoHideTitle: 'Auto-hide composer',
      autoHideDesc: 'Hide the composer when the mouse leaves the bottom; reveal near the edge or on focus',
      autoHideDelay: 'Hide delay (ms)',
      autoHideThreshold: 'Bottom trigger distance (px)',
      immersiveTitle: 'Immersive mode',
      immersiveDesc: 'Hide sidebar/details/header so the chat fills the page; toggle from the floating button',
      immersiveEnter: 'Enter immersive',
      immersiveExit: 'Exit immersive',
      keyboardTitle: 'Keyboard shortcuts',
      keyboardDesc: 'Immersive / auto-hide / focus composer / shortcut help, etc.',
      keyboardHint: 'Press ? or Ctrl+/ anytime to view shortcut help.',
      retryTitle: 'Request retries',
      retryDesc: 'Model request retry count',
      retryCurrent: 'Current',
      retryMixed: 'Providers differ',
      retrySave: 'Save',
      retrySaving: 'Saving…',
      retrySaved: 'Saved',
      retryLoadFailed: 'Failed to load',
      retrySaveFailed: 'Failed to save',
      retryInputHint: 'Number of retries after a failed model request (0 = no retry, default 2). Applies to all configured LLM providers.',
      retryProviders: 'Applied to {n} providers',
      notifyTitle: 'Desktop notifications',
      notifyDesc: 'Show system notifications while you are on another tab',
      notifyApproval: 'Remind on approval requests',
      notifyQuestion: 'Remind on questions',
      notifyTurn: 'Remind on turn finish',
      notifySessionDone: 'Remind on background session finish',
      notifyApprovalTitle: 'Approval required',
      notifyApprovalBody: 'Tool {toolName} requests privileged execution',
      notifyQuestionTitle: 'Your answer is needed',
      notifyQuestionBody: 'The agent has a question for you',
      notifyTurnTitle: 'Turn finished',
      notifyTurnBody: 'Turn {turn} completed',
      notifySessionDoneTitle: 'Session finished',
      notifySessionDoneBody: 'This session finished — switch over to see the result',
      notifyPermission: 'Notification permission',
      notifyPermissionGranted: 'On',
      notifyPermissionDenied: 'Blocked by the browser',
      notifyPermissionDefault: 'Not granted',
      notifyPermissionUnsupported: 'Not supported',
      notifyRequest: 'Enable desktop notifications',
      toastOn: 'Enabled',
      toastOff: 'Disabled',
      close: 'Close',
      keys: {
        help: 'Toggle shortcut help',
        escape: 'Close help panel',
        immersive: 'Toggle immersive mode',
        autoHide: 'Toggle auto-hide composer',
        focusComposer: 'Focus chat input',
        sidebar: 'Toggle sidebar',
        newChat: 'New conversation',
        settings: 'Open settings',
        usage: 'Open usage stats',
        plugins: 'Open plugin settings',
        scrollBottom: 'Scroll to bottom',
        scrollTop: 'Scroll to top',
      },
    }

    // ── 统一配置对象（localStorage 单 key）─────────────────────────────
    const CONFIG_KEY = 'dsh-ui-tweaks.settings'
    const DEFAULTS = {
      pluginInventory: true,
      autoHide: { enabled: true, delayMs: 600, threshold: 64 },
      immersive: { enabled: false },
      keyboard: { enabled: true },
      notify: { approval: true, question: true, turn: true, sessionDone: true },
    }
    const config = { ...DEFAULTS, autoHide: { ...DEFAULTS.autoHide }, immersive: { ...DEFAULTS.immersive }, keyboard: { ...DEFAULTS.keyboard }, notify: { ...DEFAULTS.notify } }
    function loadConfig() {
      try {
        const raw = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}')
        if (raw && typeof raw === 'object') {
          for (const k of Object.keys(DEFAULTS)) {
            const v = raw[k]
            if (v === undefined) continue
            if (k === 'autoHide' || k === 'immersive' || k === 'keyboard' || k === 'notify') {
              if (v && typeof v === 'object') Object.assign(config[k], v)
            } else config[k] = v
          }
        }
      } catch { /* storage unavailable — keep defaults */ }
    }
    function saveConfig() {
      try { localStorage.setItem(CONFIG_KEY, JSON.stringify(config)) } catch { /* storage unavailable */ }
    }

    // ── 共享样式（单 style 标签）───────────────────────────────────────
    const CSS = `
.dshut-card{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:10px;overflow:hidden;list-style:none}
.dshut-header{width:100%;box-sizing:border-box;display:flex;align-items:center;gap:10px;border:0;background:none;color:var(--dsw-alias-label-primary);font:inherit;text-align:left;padding:14px 16px;cursor:pointer}
.dshut-header:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dshut-headtext{flex:1;min-width:0;display:grid;gap:2px}
.dshut-name{font-size:14px;line-height:20px;font-weight:500}
.dshut-desc{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12.5px;line-height:18px}
.dshut-chevron{flex:none;width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary);transform:rotate(0deg);transition:transform .15s ease}
.dshut-chevron.dshut-open{transform:rotate(180deg)}
.dshut-body{box-sizing:border-box;border-top:1px solid var(--dsw-alias-border-l2);padding:4px 16px 14px;display:grid;gap:4px}
.dshut-group{display:grid;gap:4px;padding-top:10px}
.dshut-groupTitle{margin:0;font-size:12px;font-weight:600;color:var(--dsw-alias-label-tertiary);text-transform:uppercase;letter-spacing:.04em}
.dshut-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dshut-row:last-child{border-bottom:0}
.dshut-rowText{flex:1;min-width:0;display:grid;gap:2px}
.dshut-rowTitle{font-size:14px;line-height:20px;color:var(--dsw-alias-label-primary)}
.dshut-rowDesc{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12.5px;line-height:18px}
.dshut-field{display:flex;align-items:center;gap:8px}
.dshut-field input[type=checkbox]{flex:none;width:16px;height:16px;accent-color:var(--dsw-alias-state-business-primary)}
.dshut-num{box-sizing:border-box;width:88px;height:30px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;padding:0 8px}
.dshut-num:focus{outline:none;border-color:var(--dsw-alias-state-business-primary)}
.dshut-button{height:30px;border:0;border-radius:8px;background:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-primary-foreground);font:inherit;font-size:13px;padding:0 14px;cursor:pointer}
.dshut-button:disabled{opacity:.5;cursor:default}
.dshut-status{font-size:12.5px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.dshut-status.dshut-err{color:var(--dsw-alias-state-danger-fill,#F87171)}
.dshut-hint{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12.5px;line-height:18px}
.dshut-badges{display:flex;gap:6px;flex-wrap:wrap}
.dshut-badge{font-size:12px;line-height:18px;padding:2px 8px;border-radius:999px;background:var(--dsw-alias-bg-mask-2);color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l2)}
.dsh-composer-hidden{display:none !important}
html.dsh-immersive [data-phase] > [data-slot="conversation.session.header"]{display:none !important}
html.dsh-immersive [data-shell-overlay]{display:none !important}
.dsh-im-button{position:fixed;right:14px;top:14px;z-index:9999;display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary);font:inherit;font-size:12.5px;line-height:20px;cursor:pointer;box-shadow:var(--dsw-shadow-lv1)}
.dsh-im-button:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.dsh-ks-help{position:fixed;inset:0;z-index:10000;background:color-mix(in srgb, var(--dsw-alias-bg-mask-2,#14171B) 55%, transparent);display:flex;align-items:center;justify-content:center;padding:24px}
.dsh-ks-helpPanel{box-sizing:border-box;width:min(520px,100%);max-height:80vh;overflow:auto;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:14px;box-shadow:var(--dsw-shadow-lv3);padding:20px;display:grid;gap:14px}
.dsh-ks-helpHead{display:flex;align-items:center;justify-content:space-between;gap:12px}
.dsh-ks-helpTitle{margin:0;font-size:16px;font-weight:600;color:var(--dsw-alias-label-primary)}
.dsh-ks-close{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12.5px;padding:5px 12px;cursor:pointer}
.dsh-ks-close:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.dsh-ks-group{display:grid;gap:8px}
.dsh-ks-groupTitle{margin:0;font-size:12px;font-weight:600;color:var(--dsw-alias-label-tertiary);text-transform:uppercase;letter-spacing:.04em}
.dsh-ks-row{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary)}
.dsh-ks-keys{display:inline-flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}
.dsh-ks-key{display:inline-flex;align-items:center;height:22px;padding:0 7px;border:1px solid var(--dsw-alias-border-l2);border-bottom-width:2px;border-radius:6px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;white-space:nowrap}
.dshut-toast{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:20000;display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);font-size:14px;line-height:20px;box-shadow:var(--dsw-shadow-lv3);pointer-events:none;opacity:0;transition:opacity .2s ease}
.dshut-toast.dshut-toast-show{opacity:1}
`

    // ── 通用 toast（共享实现）──────────────────────────────────────────
    function showToast(text) {
      let el = document.querySelector('.dshut-toast')
      if (el) el.remove()
      el = document.createElement('div')
      el.className = 'dshut-toast'
      el.textContent = text
      document.body.appendChild(el)
      requestAnimationFrame(() => el.classList.add('dshut-toast-show'))
      setTimeout(() => {
        el.classList.remove('dshut-toast-show')
        setTimeout(() => { if (el.isConnected) el.remove() }, 200)
      }, 1500)
    }

    // ── 统一 ToggleRow：通用设置里的一个开关行 ─────────────────────────
    function ToggleRow({ title, desc, checked, onChange }) {
      return react_jsx_runtime.jsx("div", {
        className: "dshut-row",
        children: [
          react_jsx_runtime.jsx("div", {
            className: "dshut-rowText",
            children: [
              react_jsx_runtime.jsx("span", { className: "dshut-rowTitle", children: title }),
              desc ? react_jsx_runtime.jsx("p", { className: "dshut-rowDesc", children: desc }) : null,
            ],
          }),
          react_jsx_runtime.jsx("label", {
            className: "dshut-field",
            children: react_jsx_runtime.jsx("input", { type: "checkbox", checked: checked, onChange: onChange }),
          }),
        ],
      })
    }

    // ── 通用设置总入口：settings.general.item ─────────────────────────
    function UiTweaksMasterCard({ t }) {
      const [open, setOpen] = react.useState(false)
      const [, force] = react.useReducer((x) => x + 1, 0)
      // 外部改配置（悬浮按钮/快捷键）时同步重渲染，让开关状态保持最新
      react.useEffect(() => {
        const onConfig = () => force()
        window.addEventListener('dsh-ui-tweaks:config', onConfig)
        return () => window.removeEventListener('dsh-ui-tweaks:config', onConfig)
      }, [])
      const setConfig = (mutator) => {
        mutator()
        saveConfig()
        force()
        window.dispatchEvent(new CustomEvent('dsh-ui-tweaks:config', { detail: config }))
      }
      const [retry, setRetry] = react.useState({ value: '2', meta: null, status: { kind: 'idle', text: '' }, busy: false })
      const loadRetry = react.useCallback(async () => {
        try {
          const res = await fetch('/api/retry-settings', { cache: 'no-store' })
          const data = await res.json()
          if (!res.ok || !data.ok) throw new Error(data.reason || 'load failed')
          setRetry((s) => ({ ...s, meta: data, value: data.current !== null && data.current !== undefined ? String(data.current) : '2', status: { kind: 'ok', text: '' } }))
        } catch (error) {
          setRetry((s) => ({ ...s, status: { kind: 'err', text: t('retryLoadFailed') + ': ' + String((error && error.message) || error) } }))
        }
      }, [])
      react.useEffect(() => { if (open) loadRetry() }, [open, loadRetry])
      const saveRetry = async () => {
        const maxRetries = Number(retry.value)
        if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 100) {
          setRetry((s) => ({ ...s, status: { kind: 'err', text: t('retrySaveFailed') + ': 0–100' } }))
          return
        }
        setRetry((s) => ({ ...s, busy: true }))
        try {
          const res = await fetch('/api/retry-settings', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ maxRetries }),
          })
          const data = await res.json()
          if (!res.ok || !data.ok) throw new Error(data.reason || 'save failed')
          await loadRetry()
          setRetry((s) => ({ ...s, status: { kind: 'ok', text: t('retrySaved') + (data.updated ? ' · ' + t('retryProviders').replace('{n}', String(data.updated)) : '') } }))
        } catch (error) {
          setRetry((s) => ({ ...s, status: { kind: 'err', text: t('retrySaveFailed') + ': ' + String((error && error.message) || error) } }))
        } finally {
          setRetry((s) => ({ ...s, busy: false }))
        }
      }

      const [perm, setPerm] = react.useState(() => {
        if (typeof Notification === 'undefined') return 'unsupported'
        return Notification.permission
      })
      const requestPermission = async () => {
        if (typeof Notification === 'undefined') return
        setPerm(await Notification.requestPermission())
      }

      const badges = []
      if (retry.meta) {
        if (retry.meta.current !== null && retry.meta.current !== undefined) badges.push(react_jsx_runtime.jsx("span", { className: "dshut-badge", children: t('retryCurrent') + ' ' + retry.meta.current }))
        else badges.push(react_jsx_runtime.jsx("span", { className: "dshut-badge", children: t('retryMixed') }))
        if (retry.meta.mode === 'always') badges.push(react_jsx_runtime.jsx("span", { className: "dshut-badge", children: '∞' }))
        else if (retry.meta.mode === 'normal') badges.push(react_jsx_runtime.jsx("span", { className: "dshut-badge", children: 'normal' }))
        if (retry.meta.entries && retry.meta.entries.length > 0) badges.push(react_jsx_runtime.jsx("span", { className: "dshut-badge", children: t('retryProviders').replace('{n}', String(retry.meta.entries.length)) }))
      }

      const chevron = react_jsx_runtime.jsx("svg", {
        className: "dshut-chevron" + (open ? " dshut-open" : ""),
        width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", "aria-hidden": true,
        children: react_jsx_runtime.jsx("path", {
          d: "M3.5 5.75 8 10.25l4.5-4.5", stroke: "currentColor",
          strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round",
        }),
      })

      return react_jsx_runtime.jsx("li", {
        className: "dshut-card",
        children: [
          react_jsx_runtime.jsx("button", {
            type: "button", className: "dshut-header", "aria-expanded": open, onClick: () => setOpen(!open),
            children: [
              react_jsx_runtime.jsx("span", {
                className: "dshut-headtext",
                children: [
                  react_jsx_runtime.jsx("span", { className: "dshut-name", children: t('masterTitle') }),
                  react_jsx_runtime.jsx("p", { className: "dshut-desc", children: t('masterDesc') }),
                ],
              }),
              chevron,
            ],
          }),
          open ? react_jsx_runtime.jsx("div", {
            className: "dshut-body",
            children: [
              react_jsx_runtime.jsxs("div", {
                className: "dshut-group",
                children: [
                  react_jsx_runtime.jsx("p", { className: "dshut-groupTitle", children: t('groupGeneral') }),
                  react_jsx_runtime.jsx(ToggleRow, {
                    title: t('pluginInventoryTitle'), desc: t('pluginInventoryDesc'),
                    checked: config.pluginInventory,
                    onChange: () => setConfig(() => { config.pluginInventory = !config.pluginInventory }),
                  }),
                  react_jsx_runtime.jsx(ToggleRow, {
                    title: t('immersiveTitle'), desc: t('immersiveDesc'),
                    checked: config.immersive.enabled,
                    onChange: () => setConfig(() => { config.immersive.enabled = !config.immersive.enabled }),
                  }),
                  react_jsx_runtime.jsx(ToggleRow, {
                    title: t('keyboardTitle'), desc: t('keyboardDesc'),
                    checked: config.keyboard.enabled,
                    onChange: () => setConfig(() => { config.keyboard.enabled = !config.keyboard.enabled }),
                  }),
                  react_jsx_runtime.jsx(ToggleRow, {
                    title: t('autoHideTitle'), desc: t('autoHideDesc'),
                    checked: config.autoHide.enabled,
                    onChange: () => setConfig(() => { config.autoHide.enabled = !config.autoHide.enabled }),
                  }),
                  config.autoHide.enabled ? react_jsx_runtime.jsxs("div", {
                    className: "dshut-row",
                    children: [
                      react_jsx_runtime.jsx("div", {
                        className: "dshut-rowText",
                        children: react_jsx_runtime.jsx("span", { className: "dshut-rowTitle", children: t('autoHideDelay') + ' / ' + t('autoHideThreshold') }),
                      }),
                      react_jsx_runtime.jsx("div", {
                        className: "dshut-field",
                        children: [
                          react_jsx_runtime.jsx("input", {
                            className: "dshut-num", type: "number", min: 0, max: 5000, step: 50,
                            value: config.autoHide.delayMs,
                            onChange: (e) => setConfig(() => { config.autoHide.delayMs = Number(e.target.value) || 600 }),
                          }),
                          react_jsx_runtime.jsx("input", {
                            className: "dshut-num", type: "number", min: 8, max: 400, step: 8,
                            value: config.autoHide.threshold,
                            onChange: (e) => setConfig(() => { config.autoHide.threshold = Number(e.target.value) || 64 }),
                          }),
                        ],
                      }),
                    ],
                  }) : null,
                ],
              }),
              react_jsx_runtime.jsxs("div", {
                className: "dshut-group",
                children: [
                  react_jsx_runtime.jsx("p", { className: "dshut-groupTitle", children: t('groupNotify') }),
                  react_jsx_runtime.jsx(ToggleRow, {
                    title: t('notifyApproval'),
                    checked: config.notify.approval,
                    onChange: () => setConfig(() => { config.notify.approval = !config.notify.approval }),
                  }),
                  react_jsx_runtime.jsx(ToggleRow, {
                    title: t('notifyQuestion'),
                    checked: config.notify.question,
                    onChange: () => setConfig(() => { config.notify.question = !config.notify.question }),
                  }),
                  react_jsx_runtime.jsx(ToggleRow, {
                    title: t('notifyTurn'),
                    checked: config.notify.turn,
                    onChange: () => setConfig(() => { config.notify.turn = !config.notify.turn }),
                  }),
                  react_jsx_runtime.jsx(ToggleRow, {
                    title: t('notifySessionDone'),
                    checked: config.notify.sessionDone,
                    onChange: () => setConfig(() => { config.notify.sessionDone = !config.notify.sessionDone }),
                  }),
                  react_jsx_runtime.jsx("div", {
                    className: "dshut-row",
                    children: [
                      react_jsx_runtime.jsx("div", {
                        className: "dshut-rowText",
                        children: [
                          react_jsx_runtime.jsx("span", { className: "dshut-rowTitle", children: t('notifyPermission') }),
                          react_jsx_runtime.jsx("p", { className: "dshut-rowDesc", children: t('notifyDesc') }),
                        ],
                      }),
                      react_jsx_runtime.jsx("div", {
                        className: "dshut-field",
                        children: [
                          react_jsx_runtime.jsx("span", { className: "dshut-badge", children: t('notifyPermission' + (perm === 'granted' ? 'Granted' : perm === 'denied' ? 'Denied' : perm === 'default' ? 'Default' : 'Unsupported')) }),
                          perm !== 'granted' && perm !== 'unsupported'
                            ? react_jsx_runtime.jsx("button", {
                                type: "button", className: "dshut-button", onClick: requestPermission,
                                children: t('notifyRequest'),
                              })
                            : null,
                        ],
                      }),
                    ],
                  }),
                ],
              }),
              react_jsx_runtime.jsxs("div", {
                className: "dshut-group",
                children: [
                  react_jsx_runtime.jsx("p", { className: "dshut-groupTitle", children: t('groupRetry') }),
                  react_jsx_runtime.jsx("div", {
                    className: "dshut-row",
                    children: [
                      react_jsx_runtime.jsx("div", {
                        className: "dshut-rowText",
                        children: [
                          react_jsx_runtime.jsx("span", { className: "dshut-rowTitle", children: t('retryTitle') }),
                          react_jsx_runtime.jsx("p", { className: "dshut-rowDesc", children: t('retryInputHint') }),
                        ],
                      }),
                      react_jsx_runtime.jsx("div", {
                        className: "dshut-field",
                        children: [
                          react_jsx_runtime.jsx("input", {
                            className: "dshut-num", type: "number", min: 0, max: 100, step: 1,
                            value: retry.value, disabled: retry.busy,
                            onChange: (e) => setRetry((s) => ({ ...s, value: e.target.value })),
                          }),
                          react_jsx_runtime.jsx("button", {
                            type: "button", className: "dshut-button", disabled: retry.busy, onClick: saveRetry,
                            children: retry.busy ? t('retrySaving') : t('retrySave'),
                          }),
                        ],
                      }),
                    ],
                  }),
                  badges.length > 0 ? react_jsx_runtime.jsx("div", { className: "dshut-badges", children: badges }) : null,
                  retry.status.text ? react_jsx_runtime.jsx("p", { className: "dshut-status" + (retry.status.kind === 'err' ? " dshut-err" : ""), children: retry.status.text }) : null,
                ],
              }),
            ],
          }) : null,
        ],
      })
    }

    // ── auto-hide 控制器（DOM 监听，读统一配置）──────────────────────
    function applyAutoHide(ctx, t) {
      ctx.effect(() => {
        if (typeof document === 'undefined') return () => {}
        let enabled = config.autoHide.enabled
        const HIDDEN_CLASS = 'dsh-composer-hidden'
        let hideTimer = 0
        let hidden = false

        const applyHidden = () => {
          for (const seat of document.querySelectorAll('[data-composer-seat]')) {
            seat.classList.toggle(HIDDEN_CLASS, hidden)
          }
        }
        const setHidden = (v) => { if (hidden === v) return; hidden = v; applyHidden() }
        const show = () => { if (hideTimer) { clearTimeout(hideTimer); hideTimer = 0 } setHidden(false) }
        const scheduleHide = () => {
          if (hideTimer) clearTimeout(hideTimer)
          hideTimer = setTimeout(() => setHidden(true), config.autoHide.delayMs)
        }
        const onMove = (e) => {
          if (!enabled) { show(); return }
          const nearBottom = window.innerHeight - e.clientY < config.autoHide.threshold
          const focusIn = document.activeElement && document.activeElement.closest && document.activeElement.closest('[data-composer-seat]')
          if (nearBottom || focusIn) show()
          else scheduleHide()
        }
        const onFocusIn = (e) => {
          if (e.target && e.target.closest && e.target.closest('[data-composer-seat]')) show()
        }
        const onScroll = () => {
          if (!enabled) return
          const scroller = document.querySelector('[data-conversation-scroll]')
          const el = scroller || document.scrollingElement || document.documentElement
          if (el.scrollHeight - el.scrollTop - el.clientHeight < config.autoHide.threshold) show()
        }
        const onPointerDown = (e) => {
          if (enabled && window.innerHeight - e.clientY < 96) show()
        }
        const onConfig = (e) => {
          enabled = Boolean(e.detail && e.detail.autoHide && e.detail.autoHide.enabled)
          if (!enabled) show()
        }
        document.addEventListener('mousemove', onMove, { passive: true })
        document.addEventListener('pointermove', onMove, { passive: true })
        document.addEventListener('pointerdown', onPointerDown, { passive: true })
        document.addEventListener('focusin', onFocusIn)
        window.addEventListener('scroll', onScroll, { passive: true })
        window.addEventListener('dsh-ui-tweaks:config', onConfig)
        const observer = new MutationObserver(() => { if (hidden) applyHidden() })
        observer.observe(document.body, { childList: true, subtree: true })
        return () => {
          document.removeEventListener('mousemove', onMove)
          document.removeEventListener('pointermove', onMove)
          document.removeEventListener('pointerdown', onPointerDown)
          document.removeEventListener('focusin', onFocusIn)
          window.removeEventListener('scroll', onScroll)
          window.removeEventListener('dsh-ui-tweaks:config', onConfig)
          observer.disconnect()
          if (hideTimer) clearTimeout(hideTimer)
        }
      }, 'ui-tweaks: auto-hide controller')
    }

    // ── immersive 控制器（DOM + 悬浮按钮，读统一配置）────────────────
    function applyImmersive(ctx, t) {
      ctx.effect(() => {
        if (typeof document === 'undefined') return () => {}
        let enabled = config.immersive.enabled
        const ROOT_CLASS = 'dsh-immersive'
        const BUTTON_CLASS = 'dsh-im-button'
        const ENTER_SVG = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6.5 2.5H2.5v4M9.5 2.5h4v4M6.5 13.5h-4v-4M9.5 13.5h4v-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        const EXIT_SVG = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2.5 6.5h4v-4M13.5 9.5h-4v4M2.5 9.5h4v4M13.5 6.5h-4v-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        let button = null
        let originalGrid = null
        let frame = null
        let raf = 0
        let observer = null

        const findFrame = () => {
          const sidebar = document.querySelector('[data-slot="sidebar"]')
          if (sidebar) { const col = sidebar.parentElement; if (col && col.parentElement) return col.parentElement }
          const details = document.querySelector('[data-slot="details"]')
          if (details) { const col = details.parentElement; if (col && col.parentElement) return col.parentElement }
          const candidates = Array.from(document.querySelectorAll('div')).filter((el) => el.style && typeof el.style.gridTemplateColumns === 'string' && /px\s+minmax\(0,\s*1fr\)\s+px/.test(el.style.gridTemplateColumns))
          return candidates[0] || null
        }
        const applyFrame = () => {
          if (!enabled) return
          if (frame === null || !frame.isConnected) {
            frame = findFrame()
            if (frame === null) return
            if (originalGrid === null) originalGrid = frame.style.gridTemplateColumns || ''
          }
          if (frame) frame.style.gridTemplateColumns = '0px minmax(0, 1fr) 0px'
        }
        const renderButton = () => {
          if (button !== null && button.isConnected) {
            button.setAttribute('aria-label', enabled ? t('immersiveExit') : t('immersiveEnter'))
            button.title = enabled ? t('immersiveExit') : t('immersiveEnter')
            button.innerHTML = (enabled ? EXIT_SVG : ENTER_SVG) + '<span>' + (enabled ? t('immersiveExit') : t('immersiveEnter')) + '</span>'
            return
          }
          button = document.createElement('button')
          button.type = 'button'
          button.className = BUTTON_CLASS
          button.setAttribute('aria-label', enabled ? t('immersiveExit') : t('immersiveEnter'))
          button.innerHTML = (enabled ? EXIT_SVG : ENTER_SVG) + '<span>' + (enabled ? t('immersiveExit') : t('immersiveEnter')) + '</span>'
          button.addEventListener('click', () => {
            config.immersive.enabled = !config.immersive.enabled
            saveConfig()
            window.dispatchEvent(new CustomEvent('dsh-ui-tweaks:config', { detail: config }))
          })
          document.body.appendChild(button)
        }
        const removeButton = () => { if (button !== null && button.isConnected) button.remove(); button = null }
        const refresh = () => {
          document.documentElement.classList.toggle(ROOT_CLASS, enabled)
          if (enabled) { applyFrame(); renderButton() }
          else {
            removeButton()
            if (frame !== null && frame.isConnected && originalGrid !== null) frame.style.gridTemplateColumns = originalGrid
            originalGrid = null
            frame = null
          }
        }
        const scheduleRefresh = () => {
          if (raf) return
          raf = requestAnimationFrame(() => { raf = 0; refresh() })
        }
        const onConfig = () => {
          const next = config.immersive.enabled
          if (next === enabled) return
          enabled = next
          refresh()
          showToast(enabled ? t('toastOn') : t('toastOff'))
        }
        window.addEventListener('dsh-ui-tweaks:config', onConfig)
        observer = new MutationObserver(scheduleRefresh)
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] })
        refresh()
        return () => {
          window.removeEventListener('dsh-ui-tweaks:config', onConfig)
          if (raf) cancelAnimationFrame(raf)
          if (observer) observer.disconnect()
          removeButton()
          if (frame !== null && frame.isConnected && originalGrid !== null) frame.style.gridTemplateColumns = originalGrid
          document.documentElement.classList.remove(ROOT_CLASS)
        }
      }, 'ui-tweaks: immersive controller')
    }

    // ── keyboard shortcuts 控制器（DOM keydown，读统一配置）───────────
    function applyKeyboard(ctx, t) {
      const SHORTCUTS = [
        { group: 'groupGeneral', id: 'help', keys: ['?', 'Ctrl+/'] },
        { group: 'groupGeneral', id: 'escape', keys: ['Esc'] },
        { group: 'groupGeneral', id: 'sidebar', keys: ['Ctrl+Shift+S'] },
        { group: 'groupGeneral', id: 'newChat', keys: ['Ctrl+Alt+N'] },
        { group: 'groupGeneral', id: 'settings', keys: ['Ctrl+,'] },
        { group: 'groupGeneral', id: 'usage', keys: ['Ctrl+Shift+U'] },
        { group: 'groupGeneral', id: 'plugins', keys: ['Ctrl+Shift+P'] },
        { group: 'groupImmersive', id: 'immersive', keys: ['Ctrl+Shift+F'] },
        { group: 'groupComposer', id: 'autoHide', keys: ['Ctrl+Shift+H'] },
        { group: 'groupComposer', id: 'focusComposer', keys: ['Ctrl+Shift+C'] },
        { group: 'groupComposer', id: 'scrollBottom', keys: ['Ctrl+Shift+End'] },
        { group: 'groupComposer', id: 'scrollTop', keys: ['Ctrl+Shift+Home'] },
      ]
      function isEditable(target) {
        if (!target || typeof target.closest !== 'function') return false
        return !!target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])")
      }
      function clickByText(texts) {
        const el = Array.from(document.querySelectorAll('button, [role="button"], a, [role="tab"], [role="menuitem"]')).find((e) => { const txt = (e.textContent || '').trim(); return texts.some((x) => txt === x || txt.startsWith(x)) })
        if (el) { el.click(); return true }
        return false
      }
      function clickByAria(texts) {
        const el = Array.from(document.querySelectorAll('[aria-label]')).find((e) => texts.some((x) => (e.getAttribute('aria-label') || '').trim() === x))
        if (el) { el.click(); return true }
        return false
      }
      function toggleSidebar() {
        if (clickByAria(['打开侧边栏', '收起侧边栏', 'Open sidebar', 'Collapse sidebar'])) return
        clickByText(['打开侧边栏', '收起侧边栏', 'Open sidebar', 'Collapse sidebar'])
      }
      function newChat() {
        if (clickByAria(['新会话', 'New chat', 'New conversation'])) return
        clickByText(['新会话', 'New chat', 'New conversation'])
      }
      function openSettings() {
        if (clickByText(['设置', 'Settings'])) return
        clickByAria(['设置', 'Settings'])
      }
      function openUsageStats() { clickByText(['用量统计', 'Usage stats']) }
      function openPluginsSettings() { clickByText(['插件', 'Plugins']) }
      function scrollChat(bottom) {
        const scroller = document.querySelector('[data-conversation-scroll]')
        if (scroller) { scroller.scrollTop = bottom ? scroller.scrollHeight : 0; return }
        const el = document.scrollingElement || document.documentElement
        el.scrollTop = bottom ? el.scrollHeight : 0
      }

      ctx.effect(() => {
        if (typeof document === 'undefined') return () => {}
        let enabled = config.keyboard.enabled
        let helpOpen = false
        let helpEl = null

        const closeHelp = () => { helpOpen = false; if (helpEl !== null && helpEl.isConnected) helpEl.remove(); helpEl = null }
        const renderHelp = () => {
          closeHelp()
          helpOpen = true
          helpEl = document.createElement('div')
          helpEl.className = 'dsh-ks-help'
          helpEl.setAttribute('role', 'dialog')
          helpEl.setAttribute('aria-modal', 'true')
          const groups = {}
          for (const s of SHORTCUTS) { if (!groups[s.group]) groups[s.group] = []; groups[s.group].push(s) }
          const rows = Object.keys(groups).map((group) => `
            <div class="dsh-ks-group">
              <p class="dsh-ks-groupTitle">${t(group)}</p>
              ${groups[group].map((s) => `<div class="dsh-ks-row"><span>${t('keys.' + s.id)}</span><span class="dsh-ks-keys">${s.keys.map((k) => `<span class="dsh-ks-key">${k.replace(/</g, '&lt;')}</span>`).join('')}</span></div>`).join('')}
            </div>`).join('')
          helpEl.innerHTML = `<div class="dsh-ks-helpPanel"><div class="dsh-ks-helpHead"><h2 class="dsh-ks-helpTitle">Keyboard shortcuts</h2><button type="button" class="dsh-ks-close" data-dsh-ks-close>${t('close')}</button></div>${rows}</div>`
          const closeBtn = helpEl.querySelector('[data-dsh-ks-close]')
          if (closeBtn) closeBtn.addEventListener('click', closeHelp)
          document.body.appendChild(helpEl)
          if (closeBtn) closeBtn.focus()
        }
        const onKeyDown = (event) => {
          if (!enabled) return
          const mod = event.metaKey || event.ctrlKey
          const shift = event.shiftKey
          const key = (event.key || '').toLowerCase()
          if (helpOpen) {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeHelp() }
            return
          }
          if (isEditable(event.target)) return
          if (event.key === '?' || (mod && key === '/')) { event.preventDefault(); renderHelp(); return }
          if (mod && shift && key === 'f') {
            event.preventDefault()
            config.immersive.enabled = !config.immersive.enabled
            saveConfig()
            window.dispatchEvent(new CustomEvent('dsh-ui-tweaks:config', { detail: config }))
            return
          }
          if (mod && shift && key === 'h') {
            event.preventDefault()
            config.autoHide.enabled = !config.autoHide.enabled
            saveConfig()
            window.dispatchEvent(new CustomEvent('dsh-ui-tweaks:config', { detail: config }))
            return
          }
          if (mod && shift && key === 'c') {
            event.preventDefault()
            const editable = document.querySelector('[data-composer-seat] textarea, [data-composer-seat] [contenteditable="true"], [data-composer-seat] [contenteditable=""]')
            if (editable) editable.focus()
            else { const fallback = document.querySelector('[data-composer-seat]'); if (fallback) fallback.scrollIntoView({ block: 'end' }) }
            return
          }
          if (mod && shift && key === 's') { event.preventDefault(); toggleSidebar(); return }
          if (mod && event.altKey && key === 'n') { event.preventDefault(); newChat(); return }
          if (mod && key === ',') { event.preventDefault(); openSettings(); return }
          if (mod && shift && key === 'u') { event.preventDefault(); openUsageStats(); return }
          if (mod && shift && key === 'p') { event.preventDefault(); openPluginsSettings(); return }
          if (mod && shift && key === 'end') { event.preventDefault(); scrollChat(true); return }
          if (mod && shift && key === 'home') { event.preventDefault(); scrollChat(false); return }
        }
        const onConfig = (e) => { enabled = Boolean(e.detail && e.detail.keyboard && e.detail.keyboard.enabled) }
        document.addEventListener('keydown', onKeyDown, true)
        window.addEventListener('dsh-ui-tweaks:config', onConfig)
        return () => {
          document.removeEventListener('keydown', onKeyDown, true)
          window.removeEventListener('dsh-ui-tweaks:config', onConfig)
          closeHelp()
        }
      }, 'ui-tweaks: keyboard shortcuts controller')
    }

    // ── notify 控制器（sessions 监听 + 桌面通知，读统一配置）─────────
    function applyNotify(ctx, t) {
      const SUMMARY_MAX = 80
      const SESSION_LABEL_MAX = 40
      const sessions = ctx.sessions
      const hiddenNow = () => typeof document !== 'undefined' && document.visibilityState === 'hidden'
      const notificationUsable = () => typeof Notification !== 'undefined' && Notification.permission === 'granted'
      const withClickFocus = (n, onOpen) => { n.onclick = () => { window.focus(); onOpen(); n.close() }; return n }
      const titled = (kindTitle, label) => label === '' ? kindTitle : label + ' · ' + kindTitle
      const show = (title, body, tag, target) => withClickFocus(new Notification(title, { body, tag, requireInteraction: true }), target.onOpen)
      const fireNotification = (wait, target) => {
        if (wait.kind === 'approval') {
          if (!config.notify.approval) return
          const body = wait.payload.reason ?? t('notifyApprovalBody').replace('{toolName}', String(wait.payload.toolName ?? ''))
          return show(titled(t('notifyApprovalTitle'), target.label), body, wait.key, target)
        }
        if (wait.kind !== 'question') return // 未知 pending 类型：不弹，避免构造异常通知
        if (!config.notify.question) return
        const first = wait.payload.questions && wait.payload.questions[0]
        const body = first && first.question ? first.question : t('notifyQuestionBody')
        return show(titled(t('notifyQuestionTitle'), target.label), body, wait.key, target)
      }
      const fireTurnNotification = (turn, summary, target) => {
        if (!config.notify.turn) return
        const body = summary !== undefined && summary !== '' ? summary : t('notifyTurnBody').replace('{turn}', String(turn))
        return show(titled(t('notifyTurnTitle'), target.label), body, 'turn:' + turn, target)
      }
      const fireSessionDoneNotification = (target) => {
        if (!config.notify.sessionDone) return
        return show(titled(t('notifySessionDoneTitle'), target.label), t('notifySessionDoneBody'), target.tag, target)
      }
      const turnSummaryOf = (nodes, turn) => {
        let text = ''
        for (const node of nodes) {
          if (node.kind !== 'assistant' || node.turn !== turn) continue
          let joined = ''
          for (const block of node.blocks) if (block.kind === 'text') joined += block.text
          if (joined !== '') text = joined
        }
        if (text === '') return undefined
        const trimmed = text.replace(/\s+/gu, ' ').trim()
        return trimmed.length > SUMMARY_MAX ? trimmed.slice(0, SUMMARY_MAX) + '…' : trimmed
      }

      const notified = new Set()
      const completedNotified = new Set()
      const seenTurns = new Map()
      let unsubSession
      let watched
      const labelOf = (sid) => {
        const label = sessions.list.getSnapshot().byId[sid]?.displayTitle ?? sid
        return label.length > SESSION_LABEL_MAX ? label.slice(0, SESSION_LABEL_MAX) + '…' : label
      }
      const openOf = (sid) => () => { if (sessions.list.getSnapshot().byId[sid] !== undefined) sessions.open(sid) }
      const scan = () => {
        const current = sessions.list.getSnapshot().current
        if (current === undefined) return
        const session = sessions.binding(current)?.session
        if (session === undefined) return
        const snapshot = session.getSnapshot()
        if (snapshot.openState !== 'open') return
        let turns = seenTurns.get(current)
        if (turns === undefined) { seenTurns.set(current, new Set(snapshot.turnEnds.keys())); return }
        for (const turn of snapshot.turnEnds.keys()) {
          if (turns.has(turn)) continue
          turns.add(turn)
          if (hiddenNow() && notificationUsable()) fireTurnNotification(turn, turnSummaryOf(snapshot.nodes, turn), { label: labelOf(current), onOpen: openOf(current) })
        }
      }
      const scanList = () => {
        const list = sessions.list.getSnapshot()
        const current = list.current
        for (const sid of list.ids) {
          const summary = list.byId[sid]
          if (summary === undefined) continue
          if (summary.pendingInteraction !== undefined) {
            const session = sessions.binding(sid)?.session
            if (session !== undefined) for (const wait of session.getSnapshot().pending) {
              const key = sid + ':' + wait.key
              if (notified.has(key)) continue
              notified.add(key)
              if (hiddenNow() && notificationUsable()) fireNotification(wait, { label: labelOf(sid), onOpen: openOf(sid) })
            }
          }
          if (sid !== current && summary.completed === true) {
            if (!completedNotified.has(sid)) {
              completedNotified.add(sid)
              if (hiddenNow() && notificationUsable()) fireSessionDoneNotification({ label: labelOf(sid), onOpen: openOf(sid), tag: sid + ':done' })
            }
          } else if (summary.completed !== true) completedNotified.delete(sid)
        }
        for (const sid of completedNotified) if (list.byId[sid] === undefined) completedNotified.delete(sid)
        // 清理已消失会话的残留去重状态（notified / seenTurns），避免长期运行内存增长
        for (const key of notified) {
          if (key.indexOf(':') > 0 && list.byId[key.slice(0, key.indexOf(':'))] === undefined) notified.delete(key)
        }
        for (const sid of seenTurns.keys()) if (list.byId[sid] === undefined) seenTurns.delete(sid)
      }
      const watchCurrent = () => {
        const current = sessions.list.getSnapshot().current
        if (current === watched) return
        unsubSession?.()
        unsubSession = undefined
        watched = current
        if (current === undefined) return
        const session = sessions.binding(current)?.session
        if (session === undefined) return
        unsubSession = session.subscribe(scan)
        scan()
      }
      const unsubList = sessions.list.subscribe(() => { watchCurrent(); scanList() })
      watchCurrent()
      scanList()
      ctx.effect(() => () => { unsubList(); unsubSession?.() }, 'ui-tweaks: notify subscription')
    }

    // ── plugin-inventory 控制器（settings.plugins.tab 增强，受开关控制）─
    function applyPluginInventory(ctx, t) {
      const zhTab = {
        tab: '插件列表', all: '全部', builtin: '内置', custom: '自定义', loading: '正在读取插件…',
        error: '暂时无法读取插件。', retry: '重试', search: '搜索插件', catalog: '插件列表', empty: '暂无插件。',
        emptySearch: '没有匹配的插件。', enabledTag: '已启用', disabledTag: '已停用', configuration: '配置状态',
        cordis: 'Cordis 状态', unobserved: '未挂载', pending: '等待依赖', loadingPhase: '加载中', active: '已挂载',
        failed: '挂载失败', unloading: '卸载中',
      }
      const enTab = {
        tab: 'Plugin list', all: 'All', builtin: 'Built-in', custom: 'Custom', loading: 'Reading plugins…',
        error: 'Plugins are temporarily unavailable.', retry: 'Retry', search: 'Search plugins', catalog: 'Plugin list', empty: 'No plugins are available.',
        emptySearch: 'No matching plugins.', enabledTag: 'Enabled', disabledTag: 'Disabled', configuration: 'Configuration',
        cordis: 'Cordis status', unobserved: 'Unmounted', pending: 'Waiting for dependencies', loadingPhase: 'Loading', active: 'Active',
        failed: 'Failed to mount', unloading: 'Unloading',
      }
      const NS_TAB = 'ui-tweaks.pluginInventory'
      ctx.effect(() => ctx.locale.register(NS_TAB, { zh: zhTab, en: enTab }), 'ui-tweaks: plugin inventory dictionaries')
      const tt = ctx.locale.bind(NS_TAB)
      const CSS_TAB = `
.dspi-section{width:100%;max-width:760px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:14px;display:flex}
.dspi-status{margin:0;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}
.dspi-failure{color:var(--dsw-alias-state-error-primary);align-items:center;gap:10px;display:flex}
.dspi-failure p{margin:0;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}
.dspi-failure button{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;background:0 0;border-radius:6px;padding:4px 10px}
.dspi-catalog{flex-direction:column;gap:12px;display:flex}
.dspi-tabs{display:flex;gap:8px;flex-wrap:wrap}
.dspi-tab{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;line-height:20px;cursor:pointer}
.dspi-tab:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dspi-tabActive{background:var(--dsw-alias-button-primary-fill);border-color:transparent;color:var(--dsw-alias-label-primary-foreground)}
.dspi-count{font-variant-numeric:tabular-nums;font-size:12px;opacity:.85}
.dspi-search{width:100%;color:var(--dsw-alias-label-tertiary);align-items:center;display:flex;position:relative}
.dspi-search>svg{pointer-events:none;position:absolute;left:12px}
.dspi-search input{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);width:100%;height:36px;color:var(--dsw-alias-label-primary);font:inherit;border-radius:8px;outline:none;padding:0 34px 0 36px;font-size:13px}
.dspi-search input::placeholder{color:var(--dsw-alias-label-tertiary)}
.dspi-catalogHeading{align-items:baseline;gap:7px;padding:0 2px;display:flex}
.dspi-catalogHeading h3{margin:0;font-size:13px;font-weight:600;line-height:20px}
.dspi-catalogHeading span{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;font-size:12px;line-height:18px}
.dspi-cards{grid-template-columns:repeat(2,minmax(0,1fr));align-items:start;gap:10px;margin:0;padding:0;list-style:none;display:grid}
.dspi-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:10px;min-width:0;overflow:hidden}
.dspi-cardContent{box-sizing:border-box;width:100%;min-height:52px;color:inherit;font:inherit;text-align:left;cursor:pointer;background:0 0;border:0;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;display:flex}
.dspi-cardContent:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dspi-cardTitle{text-overflow:ellipsis;white-space:nowrap;min-width:0;font-size:14px;font-weight:600;line-height:20px;overflow:hidden}
.dspi-cardTrailing{color:var(--dsw-alias-label-tertiary);flex:none;align-items:center;gap:7px;display:inline-flex}
.dspi-statusDot{background:var(--dsw-alias-label-tertiary);border-radius:999px;flex:none;width:7px;height:7px;display:inline-block}
.dspi-statusDot[data-phase=active]{background:var(--dsw-alias-state-success-primary)}
.dspi-statusDot[data-phase=failed]{background:var(--dsw-alias-state-error-primary)}
.dspi-statusDot[data-phase=loading]{background:var(--dsw-alias-state-business-primary)}
.dspi-configTag{background:var(--dsw-alias-bg-layer-1);min-height:20px;color:var(--dsw-alias-label-secondary);white-space:nowrap;border-radius:5px;align-items:center;padding:1px 6px;font-size:11px;line-height:16px;display:inline-flex}
.dspi-configTag[data-enabled=true]{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent);color:var(--dsw-alias-state-success-primary)}
.dspi-chevron{color:var(--dsw-alias-label-tertiary);flex:none}
.dspi-card[data-open=true] .dspi-chevron{transform:rotate(180deg)}
.dspi-cardDetails{border-top:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-module-platform);padding:10px 14px 12px}
.dspi-entryValue{overflow-wrap:anywhere;color:var(--dsw-alias-label-primary);font-family:var(--ds-font-family-code);font-size:12px;line-height:18px;display:block}
.dspi-details{grid-template-columns:76px minmax(0,1fr);gap:6px 10px;margin:8px 0 0;display:grid}
.dspi-details div{display:contents}
.dspi-details dt{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:17px}
.dspi-details dd{overflow-wrap:anywhere;min-width:0;color:var(--dsw-alias-label-secondary);margin:0;font-size:12px;line-height:17px}
@media (width<=680px){.dspi-cards{grid-template-columns:minmax(0,1fr)}}
`
      ctx.effect(() => {
        const tag = document.createElement('style')
        tag.dataset.plugin = 'dsh-ui-tweaks'
        tag.dataset.pluginCss = 'dsh-ui-tweaks/plugin-inventory'
        tag.textContent = CSS_TAB
        document.head.appendChild(tag)
        return () => tag.remove()
      }, 'ui-tweaks: plugin inventory styles')

      const PHASE_KEYS = { pending: 'pending', loading: 'loadingPhase', active: 'active', failed: 'failed', unloading: 'unloading' }
      const phaseLabel = (phase) => phase === null ? tt('unobserved') : tt(PHASE_KEYS[phase] || phase)
      const moduleShortName = (moduleName) => {
        if (typeof moduleName !== 'string') return ''
        const parts = moduleName.split('/')
        return parts[parts.length - 1] || moduleName
      }
      const kindOf = (entry) => {
        if (!entry.enabled) return 'custom'
        const entryId = entry.entryId
        if (typeof entryId === 'string' && entryId) {
          if (entryId.startsWith('@deepseek-ai/') || /^(ui-|dsh-|cordis-)/.test(entryId)) return 'builtin'
        }
        return 'custom'
      }
      const matches = (entry, q) => {
        if (q.length === 0) return true
        return [entry.moduleName, entry.entryId].some((v) => String(v || '').toLocaleLowerCase().includes(q))
      }

      function PluginInventoryTab({ list }) {
        const catalogId = react.useId()
        const [request, setRequest] = react.useState(0)
        const [query, setQuery] = react.useState('')
        const [filter, setFilter] = react.useState('all')
        const [expanded, setExpanded] = react.useState(null)
        const [state, setState] = react.useState({ status: 'loading' })
        react.useEffect(() => {
          let current = true
          Promise.resolve().then(() => list()).then((snapshot) => { if (current) setState({ status: 'ready', snapshot }) }, () => { if (current) setState({ status: 'error' }) })
          return () => { current = false }
        }, [list, request])
        const normalizedQuery = query.trim().toLocaleLowerCase()
        const dedupedEntries = react.useMemo(() => {
          if (state.status !== 'ready') return []
          const seen = new Set()
          return state.snapshot.entries.filter((entry) => { const key = entry.moduleName || entry.entryId; if (seen.has(key)) return false; seen.add(key); return true })
        }, [state])
        const counts = react.useMemo(() => {
          if (state.status !== 'ready') return { all: 0, builtin: 0, custom: 0 }
          const builtin = dedupedEntries.filter((e) => kindOf(e) === 'builtin').length
          return { all: dedupedEntries.length, builtin, custom: dedupedEntries.length - builtin }
        }, [dedupedEntries])
        const filteredEntries = react.useMemo(() => dedupedEntries.filter((e) => (filter === 'all' || kindOf(e) === filter) && matches(e, normalizedQuery)), [filter, normalizedQuery, dedupedEntries])
        react.useEffect(() => { if (expanded !== null && !filteredEntries.some((e) => e.entryId === expanded)) setExpanded(null) }, [expanded, filteredEntries])
        const retry = () => { setState({ status: 'loading' }); setRequest((v) => v + 1) }
        return react_jsx_runtime.jsxs('div', {
          className: 'dspi-section', 'aria-busy': state.status === 'loading',
          children: [
            state.status === 'loading' ? react_jsx_runtime.jsx('p', { className: 'dspi-status', children: tt('loading') }) : null,
            state.status === 'error' ? react_jsx_runtime.jsxs('div', { className: 'dspi-failure', children: [react_jsx_runtime.jsx('p', { role: 'alert', children: tt('error') }), react_jsx_runtime.jsx('button', { type: 'button', onClick: retry, children: tt('retry') })] }) : null,
            state.status === 'ready' ? react_jsx_runtime.jsxs('div', {
              className: 'dspi-catalog',
              children: [
                react_jsx_runtime.jsxs('div', { className: 'dspi-tabs', role: 'tablist', 'aria-label': tt('tab'), children: ['all', 'builtin', 'custom'].map((key) => react_jsx_runtime.jsxs('button', { type: 'button', role: 'tab', 'aria-selected': filter === key ? 'true' : 'false', className: 'dspi-tab' + (filter === key ? ' dspi-tabActive' : ''), onClick: () => setFilter(key), children: [tt(key), react_jsx_runtime.jsx('span', { className: 'dspi-count', children: counts[key] })] }, key)) }),
                react_jsx_runtime.jsxs('label', { className: 'dspi-search', children: [react_jsx_runtime.jsx(primitives.IconSearchOutline16, { 'aria-hidden': 'true' }), react_jsx_runtime.jsx('input', { type: 'search', value: query, placeholder: tt('search'), 'aria-label': tt('search'), onChange: (e) => setQuery(e.currentTarget.value) })] }),
                react_jsx_runtime.jsxs('div', { className: 'dspi-catalogHeading', children: [react_jsx_runtime.jsx('h3', { children: tt('catalog') }), react_jsx_runtime.jsx('span', { 'data-plugin-count': filteredEntries.length, children: filteredEntries.length })] }),
                state.status === 'ready' && dedupedEntries.length === 0 ? react_jsx_runtime.jsx('p', { className: 'dspi-status', children: tt('empty') }) : null,
                state.status === 'ready' && dedupedEntries.length > 0 && filteredEntries.length === 0 ? react_jsx_runtime.jsx('p', { className: 'dspi-status', children: tt('emptySearch') }) : null,
                filteredEntries.length > 0 ? react_jsx_runtime.jsx('ul', {
                  className: 'dspi-cards',
                  children: filteredEntries.map((entry) => {
                    const status = phaseLabel(entry.fiberPhase)
                    const title = moduleShortName(entry.moduleName)
                    const configuration = tt(entry.enabled ? 'enabledTag' : 'disabledTag')
                    const open = expanded === entry.entryId
                    const detailId = catalogId + '-details-' + encodeURIComponent(entry.entryId)
                    return react_jsx_runtime.jsxs('li', {
                      className: 'dspi-card', 'data-plugin-entry': entry.entryId, 'data-open': open ? 'true' : undefined,
                      children: [
                        react_jsx_runtime.jsxs('button', {
                          className: 'dspi-cardContent', type: 'button', 'aria-expanded': open, 'aria-controls': detailId,
                          'aria-label': entry.enabled ? title + ', ' + status + ', ' + configuration : title + ', ' + configuration,
                          onClick: () => setExpanded((c) => c === entry.entryId ? null : entry.entryId),
                          children: [
                            react_jsx_runtime.jsx('strong', { className: 'dspi-cardTitle', title: entry.moduleName, children: title }),
                            react_jsx_runtime.jsxs('span', { className: 'dspi-cardTrailing', children: [
                              entry.enabled ? react_jsx_runtime.jsx('span', { className: 'dspi-statusDot', 'data-phase': entry.fiberPhase ?? 'unobserved', role: 'img', 'aria-label': status, title: status }) : null,
                              react_jsx_runtime.jsx('span', { className: 'dspi-configTag', 'data-enabled': entry.enabled ? 'true' : 'false', children: configuration }),
                              react_jsx_runtime.jsx(primitives.IconChevronDownOutline14, { className: 'dspi-chevron', size: 12, 'aria-hidden': 'true' }),
                            ] }),
                          ],
                        }),
                        open ? react_jsx_runtime.jsxs('div', { className: 'dspi-cardDetails', id: detailId, children: [
                          react_jsx_runtime.jsx('code', { className: 'dspi-entryValue', 'data-loader-entry': true, children: entry.entryId }),
                          react_jsx_runtime.jsxs('dl', { className: 'dspi-details', children: [
                            react_jsx_runtime.jsxs('div', { children: [react_jsx_runtime.jsx('dt', { children: tt('configuration') }), react_jsx_runtime.jsx('dd', { children: configuration })] }),
                            entry.enabled ? react_jsx_runtime.jsxs('div', { children: [react_jsx_runtime.jsx('dt', { children: tt('cordis') }), react_jsx_runtime.jsx('dd', { children: status })] }) : null,
                          ] }),
                        ] }) : null,
                      ],
                    }, entry.entryId)
                  }),
                }) : null,
              ],
            }) : null,
          ],
        })
      }

      // 双保险：即使官方 tab 被缓存加载，也 DOM 去重只保留增强版
      function installPluginTabDedupe() {
        if (typeof document === 'undefined' || typeof MutationObserver !== 'function') return () => {}
        const LABELS = ['插件列表', 'Plugin list']
        let raf = 0
        const patch = () => {
          raf = 0
          const buttons = Array.from(document.querySelectorAll('button[aria-controls]')).filter((b) => LABELS.includes((b.textContent || '').trim()))
          if (buttons.length > 1) {
            const keep = buttons.find((b) => { const id = b.getAttribute('aria-controls'); const panel = id ? document.getElementById(id) : null; return panel !== null && panel.querySelector('.dspi-section') !== null }) || buttons[0]
            for (const b of buttons) if (b !== keep) b.remove()
          }
          const panels = Array.from(document.querySelectorAll('[id$="-panel-all"]'))
          if (panels.length > 1) {
            const keepPanel = panels.find((p) => p.querySelector('.dspi-section') !== null) || panels[0]
            for (const p of panels) if (p !== keepPanel) p.remove()
          }
          for (const panel of Array.from(document.querySelectorAll('[id$="-panel-all"]'))) {
            const sections = Array.from(panel.querySelectorAll('.dspi-section'))
            for (const s of sections.slice(1)) s.remove()
          }
        }
        const schedule = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; patch() }) }
        const observer = new MutationObserver(schedule)
        observer.observe(document.body, { childList: true, subtree: true })
        schedule()
        return () => { if (raf) cancelAnimationFrame(raf); observer.disconnect() }
      }

      ctx.effect(() => installPluginTabDedupe(), 'ui-tweaks: plugin tab dedupe')
      // 受「插件列表增强」开关控制：关闭时不注册增强 tab（官方已禁用，则插件设置页无增强）
      ctx.slots.inject('settings.plugins.tab', () => {
        if (!config.pluginInventory) return
        return ctx.slots.register({
          name: 'settings.plugins.tab',
          id: 'all',
          order: 10,
          priority: -1,
          label: () => tt('tab'),
          locale: NS_TAB,
          inject: () => ({ list: () => ctx.remote.pluginInventory.list().then((r) => { if (!r.ok) throw new Error((r.error && r.error.message) || 'list failed'); return r.value }) }),
        }, PluginInventoryTab)
      })
    }

    // ── 统一入口 apply ────────────────────────────────────────────────
    const inject = [
      'slots',
      'locale',
      'remote',
      'remote.pluginInventory',
      'sessions',
    ]
    function apply(ctx) {
      loadConfig()
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-tweaks: dictionaries')
      ctx.effect(() => {
        const tag = document.createElement('style')
        tag.dataset.plugin = 'dsh-ui-tweaks'
        tag.dataset.pluginCss = 'dsh-ui-tweaks'
        tag.textContent = CSS
        document.head.appendChild(tag)
        return () => tag.remove()
      }, 'ui-tweaks: styles')
      const t = ctx.locale.bind(NS)

      // 通用设置总入口
      ctx.slots.inject('settings.general.item', () => ctx.slots.register({
        name: 'settings.general.item',
        id: 'ui-tweaks',
        order: 30,
        locale: NS,
      }, () => react_jsx_runtime.jsx(UiTweaksMasterCard, { t: t })))

      // 功能控制器
      applyPluginInventory(ctx, t)
      applyAutoHide(ctx, t)
      applyImmersive(ctx, t)
      applyKeyboard(ctx, t)
      applyNotify(ctx, t)

      // 卸载时持久化当前配置
      ctx.effect(() => () => saveConfig(), 'ui-tweaks: config persist')
    }
    return { name: 'dsh-ui-tweaks', inject, apply }
  },
})
