window.__ModuleLoader__.load({
	id: "dsh-model-selector",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/ModelSelect.tsx
		/**
		* ModelSelect: the enhanced composer model seat (`conversation.input.model`).
		*
		* A faithful superset of the shipped `ui-model-selection` seat: the trigger and
		* the two-level root menu (Model / Effort) are preserved, while the model pane
		* gains two additions the user asked for —
		*
		*  1. a name search box that flattens matching models across providers, and
		*  2. collapsible provider groups (chevron toggles, in-memory only).
		*
		* Data and submission ride the SAME per-session directory the /model popup
		* shares (via `modelDirectories`), so a switch made here is what the popup
		* shows next and vice versa. Icons are inline SVG paths copied from
		* @deepseek-ai/dsh-client-ui-primitives (no runtime dependency); colors
		* come from `--dsw-*` tokens in the injected stylesheet.
		*/
		function IconChevronDown() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: "14",
				height: "14",
				viewBox: "0 0 14 14",
				fill: "none",
				"aria-hidden": "true",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z",
					fill: "currentColor"
				})
			});
		}
		function IconChevronRight() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: "14",
				height: "14",
				viewBox: "0 0 14 14",
				fill: "none",
				"aria-hidden": "true",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M5.5 2.15137L5.92383 2.57617L8.65137 5.30273C8.90706 5.55843 9.13382 5.78438 9.29785 5.98828C9.46883 6.20088 9.61756 6.44405 9.66602 6.75C9.69222 6.91565 9.69222 7.08435 9.66602 7.25C9.61756 7.55595 9.46883 7.79912 9.29785 8.01172C9.13382 8.21561 8.90706 8.44157 8.65137 8.69727L5.92383 11.4238L5.5 11.8486L4.65137 11L5.07617 10.5762L7.80273 7.84863C8.07732 7.57405 8.24849 7.40124 8.3623 7.25977C8.46904 7.12709 8.47813 7.07728 8.48047 7.0625C8.48703 7.02105 8.48703 6.97895 8.48047 6.9375C8.47813 6.92272 8.46904 6.87291 8.3623 6.74023C8.24848 6.59876 8.07732 6.42595 7.80273 6.15137L5.07617 3.42383L4.65137 3L5.5 2.15137Z",
					fill: "currentColor"
				})
			});
		}
		function IconCheck() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: "14",
				height: "14",
				viewBox: "0 0 14 14",
				fill: "none",
				"aria-hidden": "true",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M11.5635 4.58984L7.61426 9.07715C7.35154 9.37561 7.11346 9.64812 6.89453 9.84668C6.66593 10.054 6.38519 10.2506 6.01465 10.3164C5.82079 10.3508 5.62207 10.3529 5.42773 10.3213C5.0561 10.2609 4.77266 10.0674 4.54102 9.86328C4.31926 9.66791 4.07752 9.39911 3.81055 9.10449L2.44531 7.59863L3.55664 6.59082L4.92188 8.09766C5.21256 8.41844 5.38878 8.61191 5.53223 8.73828C5.61022 8.80699 5.65253 8.83192 5.66895 8.83984C5.69648 8.84429 5.72449 8.84467 5.75195 8.83984C5.72657 8.84451 5.75564 8.85422 5.88672 8.73535C6.02833 8.60692 6.20225 8.41088 6.48828 8.08594L10.4385 3.59961L11.5635 4.58984Z",
					fill: "currentColor"
				})
			});
		}
		function IconClear() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: "14",
				height: "14",
				viewBox: "0 0 14 14",
				fill: "none",
				"aria-hidden": "true",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M10.6074 4.40278L8.00975 6.99973L10.6074 9.59739L9.59736 10.6074L6.9997 8.00978L4.40274 10.6074L3.3927 9.59739L5.98966 6.99973L3.3927 4.40278L4.40274 3.39273L6.9997 5.98969L9.59736 3.39273L10.6074 4.40278Z",
					fill: "currentColor"
				})
			});
		}
		/** Canonical strength order of pi-ai thinking levels (strongest = highest). */
		const EFFORT_RANK = {
			off: 0,
			minimal: 1,
			low: 2,
			medium: 3,
			high: 4,
			xhigh: 5,
			max: 6
		};
		/** The strongest thinking level a model offers, or undefined for none. */
		function maxEffortOf(reasoning) {
			let best;
			for (const effort of reasoning.efforts) {
				const rank = EFFORT_RANK[effort.id] ?? 0;
				if (best === void 0 || rank > best.rank) best = {
					id: effort.id,
					rank
				};
			}
			return best?.id;
		}
		/**
		* How long a successfully loaded directory snapshot is trusted before the
		* menu re-fetches it over RPC. The snapshot lives in the per-session store,
		* so reopening the menu within this window costs zero RPC and zero re-render.
		*/
		const DIRECTORY_STALE_MS = 3e4;
		function ModelSelect({ locked, available, directory, load, select, t }) {
			const state = (0, react.useSyncExternalStore)(directory.subscribe, directory.getSnapshot);
			const [open, setOpen] = (0, react.useState)(false);
			const [pane, setPane] = (0, react.useState)("root");
			const [query, setQuery] = (0, react.useState)("");
			const [collapsed, setCollapsed] = (0, react.useState)(() => /* @__PURE__ */ new Set());
			const [notice, setNotice] = (0, react.useState)(null);
			const lastActionRef = (0, react.useRef)("load");
			const rootRef = (0, react.useRef)(null);
			const triggerRef = (0, react.useRef)(null);
			const searchRef = (0, react.useRef)(null);
			const itemRefs = (0, react.useRef)([]);
			const lastLoadRef = (0, react.useRef)(0);
			const id = (0, react.useId)();
			const choices = (0, react.useMemo)(() => state.groups.flatMap((group) => group.models.map((model) => ({
				group,
				model,
				haystack: `${model.name}\n${model.description ?? ""}\n${group.name}\n${model.id}\n${group.id}`.toLowerCase(),
				selection: {
					provider: group.id,
					model: model.id,
					...model.reasoning?.defaultEffort === void 0 ? {} : { reasoningEffort: model.reasoning.defaultEffort }
				}
			}))), [state.groups]);
			const currentChoice = choices[(0, react.useMemo)(() => state.current === null ? -1 : choices.findIndex((c) => c.selection.provider === state.current?.provider && c.selection.model === state.current.model), [choices, state.current])];
			const reasoning = currentChoice?.model.reasoning;
			const effectiveEffort = state.current?.reasoningEffort ?? reasoning?.defaultEffort;
			const effortLabel = reasoning === void 0 ? void 0 : effectiveEffort === void 0 ? t("effort.providerDefault") : reasoning.efforts.find((level) => level.id === effectiveEffort)?.name ?? effectiveEffort;
			const effortChoices = (0, react.useMemo)(() => reasoning === void 0 ? [] : [...reasoning.defaultEffort === void 0 ? [{
				key: "provider-default",
				effort: void 0,
				label: t("effort.providerDefault")
			}] : [], ...reasoning.efforts.map((effort) => ({
				key: `effort:${effort.id}`,
				effort: effort.id,
				label: effort.name,
				...effort.description === void 0 ? {} : { description: effort.description }
			}))], [reasoning, t]);
			const busy = state.status === "selecting";
			const normalized = query.trim().toLowerCase();
			const hits = (0, react.useMemo)(() => {
				if (normalized === "") return null;
				const found = [];
				for (const choice of choices) if (choice.haystack.includes(normalized)) found.push({
					group: choice.group,
					model: choice.model
				});
				return found;
			}, [choices, normalized]);
			const reload = () => {
				lastActionRef.current = "load";
				lastLoadRef.current = Date.now();
				load();
			};
			(0, react.useEffect)(() => {
				if (available) {
					lastActionRef.current = "load";
					load();
				}
			}, [available, load]);
			(0, react.useEffect)(() => {
				if (!open) return;
				const closeOutside = (event) => {
					if (!rootRef.current?.contains(event.target)) setOpen(false);
				};
				document.addEventListener("mousedown", closeOutside);
				return () => {
					document.removeEventListener("mousedown", closeOutside);
				};
			}, [open]);
			const resetTransient = () => {
				setPane("root");
				setQuery("");
			};
			const goPane = (next) => {
				setNotice(null);
				setPane(next);
				requestAnimationFrame(() => {
					if (next === "model") searchRef.current?.focus();
					else itemRefs.current.find((item) => item !== null && !item.disabled)?.focus();
				});
			};
			(0, react.useEffect)(() => {
				if (!open) return;
				if (pane === "model") {
					searchRef.current?.focus();
					return;
				}
				itemRefs.current.find((item) => item !== null && !item.disabled)?.focus();
			}, [pane, open]);
			if (!available) return null;
			const show = () => {
				setPane("root");
				setOpen(true);
				if (state.status === "error" || state.groups.length === 0 || Date.now() - lastLoadRef.current > DIRECTORY_STALE_MS) reload();
			};
			const close = (restoreFocus = false) => {
				setOpen(false);
				setNotice(null);
				resetTransient();
				if (restoreFocus) queueMicrotask(() => {
					triggerRef.current?.focus();
				});
			};
			const moveFocus = (offset) => {
				const items = itemRefs.current.filter((item) => item !== null);
				if (items.length === 0) return;
				const active = items.findIndex((item) => item === document.activeElement);
				items[((active < 0 ? offset > 0 ? -1 : 0 : active) + offset + items.length) % items.length]?.focus();
			};
			const onRootKeyDown = (event) => {
				if (event.key === "Escape" && open) {
					event.preventDefault();
					if (pane !== "root") goPane("root");
					else close(true);
					return;
				}
				if (!open) return;
				if ((event.key === "ArrowDown" || event.key === "ArrowUp") && !(event.target instanceof HTMLInputElement)) {
					event.preventDefault();
					moveFocus(event.key === "ArrowDown" ? 1 : -1);
				}
			};
			const onBlur = (event) => {
				if (busy) return;
				const related = event.relatedTarget;
				if (related instanceof Node) {
					if (rootRef.current?.contains(related)) return;
					close();
					return;
				}
			};
			const choose = (selection) => {
				if (state.current?.provider === selection.provider && state.current.model === selection.model) {
					setNotice(t("notice.already"));
					return;
				}
				const target = choices.find((c) => c.selection.provider === selection.provider && c.selection.model === selection.model);
				const max = target?.model.reasoning === void 0 ? void 0 : maxEffortOf(target.model.reasoning);
				const effort = max === "off" ? void 0 : max;
				const full = {
					provider: selection.provider,
					model: selection.model,
					...effort === void 0 ? {} : { reasoningEffort: effort }
				};
				lastActionRef.current = "select";
				select(full).then((accepted) => {
					if (accepted && rootRef.current !== null) close(true);
				});
			};
			const chooseEffort = (effort) => {
				if (state.current === null) return;
				if (effectiveEffort === effort) {
					setNotice(t("notice.alreadyEffort"));
					return;
				}
				const selection = {
					provider: state.current.provider,
					model: state.current.model,
					...effort === void 0 ? {} : { reasoningEffort: effort }
				};
				lastActionRef.current = "select";
				select(selection).then((accepted) => {
					if (accepted && rootRef.current !== null) close(true);
				});
			};
			const toggleCollapse = (groupId) => {
				setCollapsed((prev) => {
					const next = new Set(prev);
					if (next.has(groupId)) next.delete(groupId);
					else next.add(groupId);
					return next;
				});
			};
			const modelLabel = currentChoice?.model.name ?? t("trigger.fallback");
			const providerLabel = currentChoice?.group.name;
			const triggerLabel = effortLabel === void 0 ? modelLabel : `${modelLabel} · ${effortLabel}`;
			const triggerTitle = providerLabel === void 0 ? triggerLabel : `${providerLabel} · ${triggerLabel}`;
			const triggerAria = currentChoice === void 0 ? t("trigger.selectAria") : effortLabel === void 0 ? t("trigger.aria", { model: providerLabel === void 0 ? modelLabel : `${providerLabel} ${modelLabel}` }) : t("trigger.ariaEffort", {
				model: providerLabel === void 0 ? modelLabel : `${providerLabel} ${modelLabel}`,
				effort: effortLabel
			});
			itemRefs.current.length = 0;
			let itemIndex = 0;
			const itemRef = () => {
				const at = itemIndex++;
				return (node) => {
					itemRefs.current[at] = node;
				};
			};
			const renderModelOption = (group, model, showProvider) => {
				const selected = state.current?.provider === group.id && state.current.model === model.id;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					ref: itemRef(),
					type: "button",
					className: `dms-option${selected ? " dms-selected" : ""}`,
					title: model.name,
					disabled: busy,
					onClick: () => {
						choose({
							provider: group.id,
							model: model.id
						});
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "dms-optionCopy",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "dms-nameRow",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dms-modelName",
									children: model.name
								}), model.reasoning !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dms-badge",
									title: t("badge.reasoningHint"),
									children: t("badge.reasoning")
								})]
							}),
							model.description !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dms-description",
								children: model.description
							}),
							showProvider && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dms-providerTag",
								children: group.name
							})
						]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dms-check",
						children: selected ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconCheck, {}) : null
					})]
				}, `${group.id}/${model.id}`);
			};
			const renderErrorStrip = () => {
				if (state.error !== null && lastActionRef.current === "load") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dms-error",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("error.action", { message: state.error }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "dms-retry",
						onClick: reload,
						children: t("action.reload")
					})]
				});
				if (state.error !== null && lastActionRef.current === "select") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dms-error",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("error.action", { message: state.error }) })
				});
				return null;
			};
			const renderFailures = (failures) => failures.map((failure) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dms-warning",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("warning.groupLoad", {
					name: failure.name,
					message: failure.message
				}) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: "dms-retry",
					onClick: reload,
					children: t("action.reload")
				})]
			}, failure.id));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: rootRef,
				className: "dms-root",
				onKeyDown: onRootKeyDown,
				onBlur,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					ref: triggerRef,
					type: "button",
					className: "dms-trigger",
					"aria-label": triggerAria,
					"aria-haspopup": "true",
					"aria-expanded": open,
					"aria-controls": open ? `${id}-menu` : void 0,
					title: triggerTitle,
					disabled: locked,
					onClick: () => open ? close() : show(),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dms-triggerLabel",
							children: modelLabel
						}),
						providerLabel !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dms-triggerProvider",
							children: providerLabel
						}),
						effortLabel !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dms-triggerEffort",
							children: effortLabel
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: `dms-chevron${open ? " dms-chevronOpen" : ""}`,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconChevronDown, {})
						})
					]
				}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					id: `${id}-menu`,
					className: "dms-menu" + (pane === "model" ? " dms-menuModel" : ""),
					"aria-busy": state.status === "loading" || busy,
					children: [
						pane === "root" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							ref: itemRef(),
							type: "button",
							className: "dms-cell",
							disabled: busy,
							onClick: () => {
								goPane("model");
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dms-cellLabel",
									children: t("menu.model")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dms-cellValue",
									children: modelLabel
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dms-cellChevron",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconChevronRight, {})
								})
							]
						}), reasoning !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							ref: itemRef(),
							type: "button",
							className: "dms-cell",
							disabled: busy,
							onClick: () => {
								goPane("effort");
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dms-cellLabel",
									children: t("menu.effort")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dms-cellValue",
									children: effortLabel
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dms-cellChevron",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconChevronRight, {})
								})
							]
						})] }),
						pane === "model" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							state.status === "loading" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dms-status",
								children: t("status.loading")
							}),
							renderErrorStrip(),
							state.failures.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dms-failures",
								children: renderFailures(state.failures)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dms-search",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									ref: searchRef,
									type: "text",
									className: "dms-searchInput",
									value: query,
									placeholder: t("search.placeholder"),
									"aria-label": t("search.placeholder"),
									onChange: (event) => {
										setNotice(null);
										setQuery(event.target.value);
									}
								}), query !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dms-searchClear",
									"aria-label": t("search.clearAria"),
									onClick: () => {
										setNotice(null);
										setQuery("");
										searchRef.current?.focus();
									},
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconClear, {})
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dms-groups",
								children: [hits !== null ? hits.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "dms-empty",
									children: t("search.noMatch", { query: query.trim() })
								}) : hits.map((hit) => renderModelOption(hit.group, hit.model, true)) : state.groups.map((group) => {
									const headingId = `${id}-${group.id}`;
									const isCollapsed = collapsed.has(group.id);
									return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
										role: "group",
										"aria-labelledby": headingId,
										className: "dms-group",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											type: "button",
											id: headingId,
											className: "dms-groupHeader",
											"aria-expanded": !isCollapsed,
											"aria-label": t("group.toggleAria", {
												name: group.name,
												count: String(group.models.length)
											}),
											onClick: () => {
												toggleCollapse(group.id);
											},
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: `dms-groupChevron${isCollapsed ? " dms-groupChevronClosed" : ""}`,
													children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconChevronDown, {})
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "dms-groupName",
													children: group.name
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "dms-groupCount",
													children: group.models.length
												})
											]
										}), !isCollapsed && group.models.map((model) => renderModelOption(group, model, false))]
									}, group.id);
								}), hits === null && state.status === "ready" && choices.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "dms-empty",
									children: t("empty.models")
								})]
							})
						] }),
						pane === "effort" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [state.error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dms-error",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("error.action", { message: state.error }) }), lastActionRef.current === "load" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dms-retry",
								onClick: reload,
								children: t("action.reload")
							})]
						}), effortChoices.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dms-empty",
							children: t("empty.efforts")
						}) : effortChoices.map((level) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							ref: itemRef(),
							type: "button",
							className: `dms-option${effectiveEffort === level.effort ? " dms-selected" : ""}`,
							disabled: busy,
							onClick: () => {
								chooseEffort(level.effort);
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "dms-optionCopy",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dms-modelName",
									children: level.label
								}), level.description !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dms-description",
									children: level.description
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dms-check",
								children: effectiveEffort === level.effort ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconCheck, {}) : null
							})]
						}, level.key))] }),
						notice !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dms-notice",
							role: "status",
							children: notice
						})
					]
				})]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/**
		* `modelSelector` namespace dictionaries for the enhanced model seat.
		*
		* Simplified Chinese is the key-set source of truth; the English dictionary is
		* checked complete against it. Product copy is Chinese-first per repo style.
		*/
		const zh = {
			"trigger.fallback": "选择模型",
			"trigger.selectAria": "选择模型",
			"trigger.aria": "选择模型，当前 {model}",
			"trigger.ariaEffort": "选择模型，当前 {model}，推理等级 {effort}",
			"menu.model": "模型",
			"menu.effort": "推理等级",
			"search.placeholder": "搜索模型",
			"search.clearAria": "清除搜索",
			"search.noMatch": "没有匹配“{query}”的模型。",
			"group.toggleAria": "{name}（{count} 个模型）",
			"effort.providerDefault": "Default",
			"status.loading": "正在刷新模型列表…",
			"error.action": "模型操作失败：{message}",
			"action.reload": "重新加载",
			"warning.groupLoad": "{name} 加载失败：{message}",
			"empty.models": "没有可用的模型。",
			"empty.efforts": "当前模型未提供推理等级。",
			"notice.already": "已是当前模型，无需切换",
			"notice.alreadyEffort": "已是当前推理等级",
			"badge.reasoning": "推理",
			"badge.reasoningHint": "支持思考等级，切换后自动选到最大思考强度"
		};
		const en = {
			"trigger.fallback": "Select model",
			"trigger.selectAria": "Select model",
			"trigger.aria": "Select model, current {model}",
			"trigger.ariaEffort": "Select model, current {model}, reasoning effort {effort}",
			"menu.model": "Model",
			"menu.effort": "Effort",
			"search.placeholder": "Search models",
			"search.clearAria": "Clear search",
			"search.noMatch": "No models match “{query}”.",
			"group.toggleAria": "{name} ({count} models)",
			"effort.providerDefault": "Default",
			"status.loading": "Refreshing model list…",
			"error.action": "Model operation failed: {message}",
			"action.reload": "Reload",
			"warning.groupLoad": "{name} failed to load: {message}",
			"empty.models": "No models available.",
			"empty.efforts": "This model provides no reasoning effort levels.",
			"notice.already": "Already the current model",
			"notice.alreadyEffort": "Already the current effort",
			"badge.reasoning": "Reasoning",
			"badge.reasoningHint": "Supports reasoning levels; switches land on the strongest"
		};
		//#endregion
		//#region src/client/styles.ts
		/**
		* Stylesheet for the enhanced model seat.
		*
		* Injected as one `<style data-plugin="dsh-model-selector">` tag by the client
		* apply and removed again on unload. Class names are prefixed `dms-` so they
		* cannot collide with CSS-module hashes from other plugins. Colors come only
		* from `--dsw-*` theme tokens, matching the shipped Menu material.
		*/
		const CSS = `
.dms-root {
  position: relative;
  min-width: 0;
}

.dms-trigger {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  max-width: min(420px, calc(100vw - 48px));
  height: 28px;
  padding: 0 4px 0 8px;
  border: none;
  border-radius: 24px;
  outline: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 20px;
  font-weight: 500;
  cursor: pointer;
}
.dms-trigger:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.dms-trigger:focus-visible { box-shadow: 0 0 0 2px var(--dsw-alias-border-l3); }
.dms-trigger:disabled { color: var(--dsw-alias-label-dimmed); cursor: default; }

.dms-triggerLabel {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 20px;
}
.dms-triggerEffort {
  flex: 0 0 auto;
  line-height: 20px;
  color: var(--dsw-alias-label-caption);
}
.dms-triggerProvider {
  flex: 0 0 auto;
  max-width: 88px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-caption);
  font-size: 11px;
  line-height: 20px;
  font-weight: 400;
}

.dms-chevron,
.dms-groupChevron,
.dms-cellChevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  line-height: 0;
}
.dms-chevron {
  color: var(--dsw-alias-label-caption);
  transition: transform 120ms ease;
}
.dms-chevronOpen { transform: rotate(180deg); }
.dms-groupChevron {
  color: var(--dsw-alias-label-tertiary);
  transition: transform 120ms ease;
}
.dms-groupChevronClosed { transform: rotate(-90deg); }
.dms-cellChevron { color: var(--dsw-alias-label-tertiary); }
.dms-check svg { display: block; }

.dms-menu {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  z-index: 20;
  display: flex;
  flex-direction: column;
  width: min(280px, calc(100vw - 32px));
  max-height: min(420px, calc(100vh - 96px));
  overflow: hidden;
  padding: 4px 0 4px 4px;
  border: 1px solid var(--dsw-alias-border-inverted);
  border-radius: 12px;
  background: var(--dsw-specific-menu);
  box-shadow: var(--dsw-shadow-lv3);
  color: var(--dsw-alias-label-primary);
  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);
  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);
}
.dms-menuModel { border-right: none; }

.dms-status,
.dms-empty {
  flex: 0 0 auto;
  padding: 10px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  line-height: 20px;
}

/* Provider-load failure strip: capped and scrollable so a long list of failed
   groups can never squeeze the model list out of the menu (E4). */
.dms-failures {
  flex: 0 0 auto;
  max-height: 96px;
  min-height: 0;
  overflow-y: auto;
}

.dms-error,
.dms-warning {
  flex: 0 0 auto;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
  padding: 7px 8px;
  border-radius: 8px;
  background: var(--dsw-alias-interactive-bg-hover-danger);
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
  line-height: 18px;
}
.dms-warning {
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-state-warn-label);
}
.dms-retry {
  flex: 0 0 auto;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

/* Search box pinned above the scrollable list. */
.dms-search {
  position: relative;
  margin-bottom: 4px;
  margin-right: 4px;
  flex: 0 0 auto;
}
.dms-searchInput {
  box-sizing: border-box;
  width: 100%;
  height: 30px;
  padding: 0 30px 0 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  outline: none;
  background: var(--dsw-alias-bg-input);
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 18px;
}
.dms-searchInput::placeholder { color: var(--dsw-alias-label-tertiary); }
.dms-searchInput:focus-visible { box-shadow: 0 0 0 2px var(--dsw-alias-border-l3); }
.dms-searchClear {
  position: absolute;
  top: 0;
  right: 0;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}
.dms-searchClear:hover { color: var(--dsw-alias-label-primary); }

.dms-groups { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
.dms-group + .dms-group { margin-top: 4px; }

/* Collapsible provider header: a full-width toggle button. */
.dms-groupHeader {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 5px 8px 3px;
  border: none;
  outline: none;
  background: var(--dsw-specific-menu);
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
}
.dms-groupHeader:hover { color: var(--dsw-alias-label-primary); }
.dms-groupName {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dms-groupCount { flex: 0 0 auto; color: var(--dsw-alias-label-dimmed); font-weight: 400; }

.dms-option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 38px;
  padding: 6px 8px;
  border: none;
  border-radius: 10px;
  outline: none;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.dms-option:hover:not(:disabled),
.dms-option:focus-visible { background: var(--dsw-alias-interactive-bg-hover); }
.dms-option.dms-selected { background: var(--dsw-alias-interactive-bg-hover); }
.dms-option:disabled { color: var(--dsw-alias-label-dimmed); cursor: default; }

.dms-optionCopy {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}
.dms-nameRow {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.dms-modelName {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  color: inherit;
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dms-badge {
  flex: 0 0 auto;
  padding: 0 6px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 999px;
  color: var(--dsw-alias-label-caption);
  font-size: 10px;
  line-height: 16px;
  font-weight: 500;
}
.dms-notice {
  flex: 0 0 auto;
  margin: 4px 0 0;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
}
.dms-description {
  overflow: hidden;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dms-providerTag {
  overflow: hidden;
  color: var(--dsw-alias-label-dimmed);
  font-size: 12px;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dms-check {
  display: grid;
  place-items: center;
  flex: 0 0 18px;
  color: var(--dsw-alias-label-primary);
}

/* Two-level root cells. */
.dms-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 40px;
  padding: 0 10px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  line-height: 22px;
  cursor: pointer;
  text-align: left;
}
.dms-cell:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dms-cell + .dms-cell { margin-top: 6px; }
.dms-cellLabel {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dms-cellValue {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-tertiary);
}
.dms-cellChevron { flex: 0 0 auto; color: var(--dsw-alias-label-tertiary); }
`;
		//#endregion
		//#region src/client/index.ts
		/**
		* dsh-model-selector — browser half.
		*
		* Replaces the shipped `conversation.input.model` seat with an enhanced one
		* (provider-group collapse + name search) while keeping the exact shared
		* per-session directory (`ctx.modelDirectories`) the /model popup reads, so
		* both entries stay in sync. Shadowing is the sanctioned seam: the slot is
		* `single`, so a registration at a LOWER priority than the shipped occupant
		* (default 0) becomes the rendered winner.
		*/
		/** Dictionary namespace owned by this plugin. */
		const NS = "modelSelector";
		/** Required services: the registry, session lookup, locale, and the slot seat. */
		const inject = [
			"slots",
			"sessions",
			"locale"
		];
		/**
		* Client plugin body: register the dictionaries and stylesheet, then take the
		* model seat over the shared directory once `modelDirectories` appears.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "dsh-model-selector: dictionaries");
			ctx.effect(() => {
				const tag = document.createElement("style");
				tag.dataset.plugin = "dsh-model-selector";
				tag.textContent = CSS;
				document.head.appendChild(tag);
				return () => {
					tag.remove();
				};
			}, "dsh-model-selector: styles");
			ctx.inject(["modelDirectories"], (scope) => {
				const models = scope.modelDirectories;
				const sessions = scope.sessions;
				scope.slots.inject("conversation.input.model", () => scope.slots.register({
					name: "conversation.input.model",
					locale: NS,
					priority: -1,
					inject: (sessionId) => {
						const directory = models.directoryFor(sessionId);
						const available = sessions.subagentAddress(sessionId) === void 0;
						return {
							available,
							directory: directory.store,
							load: () => {
								if (available) directory.load().catch(() => {});
							},
							select: (selection) => available ? directory.select(selection).then(() => true, () => false) : Promise.resolve(false)
						};
					}
				}, ModelSelect));
			});
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
