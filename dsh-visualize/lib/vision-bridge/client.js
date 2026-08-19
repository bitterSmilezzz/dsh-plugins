// Browser half of dsh-vision-bridge (dsh-essentials internal module).
// Minimal first version: settings/status card. The host does the heavy lifting
// (auto-describe, pre-step/llm-stream rewrite, vision_read_image tool).
// This factory is merged into lib/client.js as sub_visionBridge.

function sub_visionBridge(require) {
    var module = { exports: {} }
    var exports = module.exports

    var CSS = [
      '.vb-card{display:flex;flex-direction:column;gap:12px;width:100%;color:var(--dsw-alias-label-primary)}',
      '.vb-card-head{display:flex;align-items:center;gap:8px}',
      '.vb-card-title{font-size:15px;font-weight:600}',
      '.vb-card-badge{font-size:12px;line-height:20px;padding:0 8px;border-radius:999px;background:var(--dsw-alias-state-success-bg);color:var(--dsw-alias-state-success-foreground)}',
      '.vb-card-badge[data-enabled=false]{background:var(--dsw-alias-state-error-bg);color:var(--dsw-alias-state-error-foreground)}',
      '.vb-card-copy{font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}',
      '.vb-card-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;padding:14px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}',
      '.vb-card-grid>div{display:flex;flex-direction:column;gap:4px;min-width:0}',
      '.vb-card-grid strong{font-size:18px;line-height:24px;font-weight:600}',
      '.vb-card-grid span{font-size:12px;color:var(--dsw-alias-label-caption)}',
      '.vb-card-error{font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary)}',
      '@media(max-width:720px){.vb-card-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}',
    ].join('')

    function ensureCss() {
      if (typeof document === 'undefined') return
      if (document.querySelector('style[data-plugin-css="vision-bridge"]')) return
      var style = document.createElement('style')
      style.dataset.plugin = 'vision-bridge'
      style.dataset.pluginCss = 'vision-bridge'
      style.textContent = CSS
      document.head.appendChild(style)
    }

    function mountCard(ctx) {
      var react
      try {
        react = require('react')
      } catch (error) {
        console.error('[vision-bridge] settings card skipped: ' + error)
        return
      }
      var ui = require('@deepseek-ai/dsh-client-ui-primitives')
      var Card = ConfigCard(react, ui)
      ctx.slots.inject('settings.plugin.item', function* () {
        yield ctx.slots.register({ name: 'settings.plugin.item', key: 'vision-bridge', id: 'vision-bridge', order: 30 }, Card)
      })
    }

    function ConfigCard(React, ui) {
      var h = React.createElement
      var useState = React.useState
      var useEffect = React.useEffect

      function loadStatus(setState) {
        fetch('/vision-bridge/status', { headers: { accept: 'application/json' } })
          .then(function (res) { return res.ok ? res.json() : null })
          .then(function (data) {
            if (data) setState({ status: data, error: null })
          })
          .catch(function (error) {
            setState(function (prev) { return { status: prev && prev.status, error: error.message } })
          })
      }

      return function VisionBridgeCard() {
        var _a = useState({ status: null, error: null })
        var state = _a[0]
        var setState = _a[1]
        useEffect(function () {
          loadStatus(setState)
          var timer = setInterval(function () { loadStatus(setState) }, 5000)
          return function () { clearInterval(timer) }
        }, [])
        var status = state.status
        return h('div', { className: 'vb-card' },
          h('div', { className: 'vb-card-head' },
            h('span', { className: 'vb-card-title' }, '视觉桥（Vision Bridge）'),
            status ? h('span', { className: 'vb-card-badge', 'data-enabled': !!status.enabled }, status.enabled ? '已启用' : '已停用') : null,
          ),
          h('div', { className: 'vb-card-copy' },
            '自动把图片转为文字证据，纯文本模型也能看图；原图保留在会话日志。'),
          status ? h('div', { className: 'vb-card-grid' },
            h('div', null, h('strong', null, String(status.autoDescribe)), h('span', null, '自动识图')),
            h('div', null, h('strong', null, String(status.cacheEntries)), h('span', null, '描述缓存')),
            h('div', null, h('strong', null, status.localOcr ? '可用' : '不可用'), h('span', null, '本地 OCR')),
            h('div', null, h('strong', null, String(status.descriptionCap)), h('span', null, 'token 预算')),
          ) : null,
          state.error ? h('div', { className: 'vb-card-error' }, String(state.error)) : null,
        )
      }
    }

    function apply(ctx) {
      ensureCss()
      if (!ctx || !ctx.slots) return
      try {
        mountCard(ctx)
      } catch (error) {
        console.error('[vision-bridge] settings card skipped: ' + error)
      }
    }

    exports.apply = apply
    exports.inject = []
    return module.exports
}
