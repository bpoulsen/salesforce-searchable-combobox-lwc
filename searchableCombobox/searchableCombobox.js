import { LightningElement, api } from "lwc";

/**
 * `c-searchable-combobox`
 *
 * A lightweight, reusable searchable combobox (single-select) for Lightning Web Components.
 *
 * ## What it does
 * - **Adapts to list size**: renders a standard `lightning-combobox` when there
 *   are few options, and the searchable combobox when there are many. The
 *   crossover point is controlled by `searchThreshold` (see below).
 * - **Displays** a searchable input that opens a dropdown list of options
 * - **Filters** options by keyword (case-insensitive substring match) as the user types
 * - **Supports keyboard navigation** while focus remains in the input:
 *   - **ArrowDown**: open dropdown (if closed) and highlight the first option; move highlight down
 *   - **ArrowUp**: move highlight up (clears highlight when moving above the first row)
 *   - **Home / End**: jump highlight to first / last option
 *   - **PageUp / PageDown**: jump highlight by a small page (currently 5)
 *   - **Enter**: select the highlighted option
 *   - **Escape**: close the dropdown
 * - **Shows a checkmark** next to the currently selected option when the dropdown is open
 * - **Closes on outside click** (document-level `mousedown`) without interfering with option clicks
 *
 * ## Inputs (public API)
 * - `label` (String): visible label shown by `lightning-input`
 * - `name` (String): included in the dispatched `change` event detail (useful for forms)
 * - `placeholder` (String): placeholder for the search input
 * - `options` (Array<{label: string, value: string}>): list of options to display
 * - `searchThreshold` (Number, default `10`): controls the small-list fallback.
 *   When `options.length <= searchThreshold`, the component renders a standard
 *   `lightning-combobox` (the native Salesforce picker) instead of the searchable
 *   combobox. When `options.length > searchThreshold`, the searchable combobox
 *   is used. The check is reactive — if `options` or `searchThreshold` change
 *   at runtime and the count crosses the threshold, the rendered control swaps
 *   automatically. An undefined / non-array `options` keeps the searchable
 *   path until data arrives. See "Adaptive rendering" below for parity details.
 * - `clear()` (Function): imperative API to clear the current selection and close the dropdown.
 *
 * ## Adaptive rendering (`searchThreshold`)
 * The fallback `lightning-combobox` is a drop-in for parents — no consumer
 * code needs to change when the threshold flips:
 * - **`change` event**: re-dispatched with the same `{ name, value, label }`
 *   detail shape used by the searchable path (the native combobox's raw
 *   `event.detail.value` is translated by looking up the matching option).
 * - **`open` / `close` events**: fired best-effort on the native combobox's
 *   focus / blur. `lightning-combobox` doesn't expose dropdown lifecycle
 *   events, so focus/blur is the closest available proxy.
 * - **`clear()`**: works in both modes. In native mode, clearing nulls the
 *   internal selection, which the bound `value` reflects, and dispatches
 *   the same cleared `change` event.
 * - **Selection persistence**: the internally tracked selection is shared
 *   across both paths, so a value selected in one mode is preserved if the
 *   options array later crosses the threshold.
 *
 * ## Events (parent-facing)
 * - **`change`** (bubbles + composed):
 *   - Fired whenever the user selects an option, or clears the selection via the input clear action.
 *   - `event.detail` shape:
 *     - `name`: the component `name`
 *     - `value`: selected value (e.g., an Id); `undefined` when cleared
 *     - `label`: selected label; `undefined` when cleared
 * - **`open`** (bubbles + composed): fired when the dropdown panel opens
 * - **`close`** (bubbles + composed): fired when the dropdown panel closes
 *
 * ## Example: render with static options
 *
 * ```html
 * <c-searchable-combobox
 *   label="Status"
 *   name="status"
 *   placeholder="Search statuses"
 *   options={statusOptions}
 *   onchange={handleStatusChange}
 *   onopen={handleOpen}
 *   onclose={handleClose}>
 * </c-searchable-combobox>
 * ```
 *
 * ```js
 * statusOptions = [
 *   { label: 'New', value: 'new' },
 *   { label: 'In Progress', value: 'inProgress' },
 *   { label: 'Closed', value: 'closed' },
 * ];
 *
 * handleStatusChange(event) {
 *   const { name, value, label } = event.detail;
 *   // name: "status"
 *   // value: "inProgress"
 *   // label: "In Progress"
 * }
 * ```
 *
 * ## Example: render with Apex-provided options
 *
 * ```html
 * <c-searchable-combobox
 *   label="Account"
 *   name="accountId"
 *   options={accountOptions}
 *   onchange={handleAccountChange}>
 * </c-searchable-combobox>
 * ```
 *
 * Where `accountOptions` is an array like:
 * `[{ label: 'Acme', value: '001...' }, ...]`
 *
 * ## Example: tuning `searchThreshold`
 *
 * Force the searchable UI even for tiny lists by setting the threshold to `0`:
 *
 * ```html
 * <c-searchable-combobox
 *   label="Status"
 *   options={statusOptions}
 *   search-threshold="0"
 *   onchange={handleStatusChange}>
 * </c-searchable-combobox>
 * ```
 *
 * Or always use the native `lightning-combobox` regardless of size by setting
 * a very large threshold:
 *
 * ```html
 * <c-searchable-combobox
 *   label="Status"
 *   options={statusOptions}
 *   search-threshold="9999"
 *   onchange={handleStatusChange}>
 * </c-searchable-combobox>
 * ```
 */
let domIdSequence = 0;

export default class SearchableCombobox extends LightningElement {
  static delegatesFocus = true;

  pickListOrdered;
  searchResults;
  selectedSearchResult;
  highlightedIndex = -1;

  outsideClickScheduleId;
  outsideDismissListenerAttached = false;

  /** True while the options panel is shown (for open/close events). */
  _panelOpen = false;

  domIdPrefix;
  listboxId;

  _options;

  @api label = "Searchable Combobox";
  @api name;
  @api placeholder = "Search";
  @api searchThreshold = 10;

  @api
  get options() {
    return this._options;
  }
  set options(value) {
    this._options = value;
    if (Array.isArray(value) && value.length > 0) {
      this.pickListOrdered = [...value].sort((a, b) =>
        a.label.localeCompare(b.label),
      );
    } else {
      this.pickListOrdered = undefined;
    }
  }

  /**
   * Decides which control renders. Returns true when the option list is short
   * enough (`length <= searchThreshold`) to defer to the native
   * `lightning-combobox`; false uses the searchable combobox. Re-evaluated on
   * every render, so changes to `options` or `searchThreshold` swap the
   * rendered control automatically. Undefined / non-array `options` stays on
   * the searchable path so we don't render an empty native combobox while
   * data is loading.
   */
  get showNativeCombobox() {
    return (
      Array.isArray(this._options) &&
      this._options.length <= this.searchThreshold
    );
  }

  /**
   * The selected option's `value` (not its `label`), bound to the native
   * `lightning-combobox`'s `value` attribute. The searchable path uses
   * `selectedValue` instead, which exposes the label for the search input.
   */
  get nativeSelectedValue() {
    return this.selectedSearchResult?.value ?? null;
  }

  @api
  clear() {
    if (this.selectedSearchResult) {
      this.selectedSearchResult = null;
      this.dispatchChange();
    }
    this.clearSearchResults();
  }

  connectedCallback() {
    const n = ++domIdSequence;
    this.domIdPrefix = `searchable-combobox-${n}`;
    this.listboxId = `${this.domIdPrefix}-listbox`;
  }

  renderedCallback() {
    if (this.showNativeCombobox && this.searchResults) {
      this.clearSearchResults();
    }
  }

  get selectedValue() {
    return this.selectedSearchResult?.label ?? null;
  }

  get panelIsOpen() {
    return Array.isArray(this.searchResults);
  }

  get listboxAriaLabel() {
    return `${this.label}. Type to filter. Use arrow keys to choose an option.`;
  }

  get listItems() {
    const results = this.searchResults;
    if (!results || !results.length) {
      return [];
    }
    const selectedVal = this.selectedSearchResult?.value;
    const hi = this.highlightedIndex;
    const base =
      "slds-media slds-listbox__option slds-listbox__option_plain slds-media_small slds-media_center";
    return results.map((opt, index) => ({
      key: opt.value,
      label: opt.label,
      value: opt.value,
      index,
      optionDomId: `${this.domIdPrefix}-opt-${index}`,
      isSelected: opt.value === selectedVal,
      isHighlighted: index === hi,
      optionClass: base + (index === hi ? " slds-has-focus" : ""),
    }));
  }

  boundCloseOnOutsideMouseDown = (event) => {
    this.handleOutsideMouseDown(event);
  };

  disconnectedCallback() {
    this.teardownOutsideDismissListener();
  }

  /**
   * True if the event target lies inside this component, including nested
   * shadow roots (e.g. lightning-input). Uses composedPath when available,
   * then walks shadow hosts — click/mousedown retargeting varies by runtime.
   */
  isEventInsideThisComponent(event) {
    const host = this.template.host;
    if (!host) {
      return false;
    }
    if (typeof event.composedPath === "function") {
      try {
        const path = event.composedPath();
        if (path && path.includes(host)) {
          return true;
        }
      } catch (e) {
        // composedPath can throw under some sandboxed runtimes; fall through to host walk.
      }
    }
    let node = event.target;
    if (!node) {
      return false;
    }
    while (node) {
      if (node === host) {
        return true;
      }
      const root = node.getRootNode();
      if (root instanceof ShadowRoot) {
        node = root.host;
      } else {
        return false;
      }
    }
    return false;
  }

  /**
   * Registers a delayed document listener so the opening pointer gesture does
   * not dismiss the list. Uses mousedown (not click): the mouseup "click" after
   * press-and-hold can bubble to document and falsely read as outside under LWS.
   */
  ensureOutsideDismissListenerSoon() {
    if (this.outsideDismissListenerAttached || !this.searchResults) {
      return;
    }
    if (this.outsideClickScheduleId != null) {
      window.clearTimeout(this.outsideClickScheduleId);
    }
    this.outsideClickScheduleId = window.setTimeout(() => {
      this.outsideClickScheduleId = null;
      if (this.searchResults && !this.outsideDismissListenerAttached) {
        document.addEventListener(
          "mousedown",
          this.boundCloseOnOutsideMouseDown,
          false,
        );
        this.outsideDismissListenerAttached = true;
      }
    }, 0);
  }

  teardownOutsideDismissListener() {
    if (this.outsideClickScheduleId != null) {
      window.clearTimeout(this.outsideClickScheduleId);
      this.outsideClickScheduleId = null;
    }
    if (this.outsideDismissListenerAttached) {
      document.removeEventListener(
        "mousedown",
        this.boundCloseOnOutsideMouseDown,
        false,
      );
      this.outsideDismissListenerAttached = false;
    }
  }

  handleOutsideMouseDown(event) {
    if (!this.searchResults) {
      return;
    }
    const inside = this.isEventInsideThisComponent(event);
    if (!inside) {
      this.clearSearchResults();
    }
  }

  notifyPanelOpened() {
    if (!this._panelOpen) {
      this._panelOpen = true;
      this.dispatchEvent(
        new CustomEvent("open", { bubbles: true, composed: true }),
      );
    }
  }

  notifyPanelClosed() {
    if (this._panelOpen) {
      this._panelOpen = false;
      this.dispatchEvent(
        new CustomEvent("close", { bubbles: true, composed: true }),
      );
    }
  }

  dispatchChange() {
    const sel = this.selectedSearchResult;
    this.dispatchEvent(
      new CustomEvent("change", {
        bubbles: true,
        composed: true,
        detail: {
          value: sel ? sel.value : undefined,
          label: sel ? sel.label : undefined,
          name: this.name,
        },
      }),
    );
  }

  /**
   * Bridges the native `lightning-combobox`'s `change` event to the same
   * `{ name, value, label }` detail shape parents already expect from the
   * searchable path. The native event only carries `event.detail.value`, so
   * we look up the matching option to recover the label. An empty value is
   * treated as a clear (mirrors searchable input behavior on full delete).
   */
  handleNativeChange(event) {
    event.stopPropagation();
    const value = event?.detail?.value;
    if (value == null || value === "") {
      if (this.selectedSearchResult) {
        this.selectedSearchResult = null;
        this.dispatchChange();
      }
      return;
    }
    const match = (this._options || []).find((opt) => opt.value === value);
    if (!match) {
      return;
    }
    this.selectedSearchResult = match;
    this.dispatchChange();
  }

  /**
   * Native combobox focus/blur are used as a best-effort proxy for the
   * `open`/`close` parent events, since `lightning-combobox` doesn't expose
   * dropdown lifecycle events. This keeps consumers wired with `onopen` /
   * `onclose` working in both rendering modes.
   */
  handleNativeFocus() {
    this.notifyPanelOpened();
  }

  handleNativeBlur() {
    this.notifyPanelClosed();
  }

  normalizeKey(event) {
    if (event.key) {
      return event.key;
    }
    const d = event.detail;
    if (d && d.key) {
      return d.key;
    }
    const code = event.keyCode ?? d?.keyCode;
    const map = {
      40: "ArrowDown",
      38: "ArrowUp",
      13: "Enter",
      27: "Escape",
      36: "Home",
      35: "End",
      33: "PageUp",
      34: "PageDown",
    };
    return map[code] || "";
  }

  handleInputKeydown(event) {
    const key = this.normalizeKey(event);
    let handled = false;
    switch (key) {
      case "ArrowDown":
        handled = this.handleArrowDown();
        break;
      case "ArrowUp":
        handled = this.handleArrowUp();
        break;
      case "Home":
        handled = this.handleHomeKey();
        break;
      case "End":
        handled = this.handleEndKey();
        break;
      case "PageUp":
        handled = this.handlePageUpKey();
        break;
      case "PageDown":
        handled = this.handlePageDownKey();
        break;
      case "Enter":
        handled = this.handleEnterKey();
        break;
      case "Escape":
        handled = this.handleEscapeKey();
        break;
      default:
        break;
    }
    if (handled) {
      event.preventDefault();
    }
  }

  handleArrowDown() {
    if (!this.pickListOrdered?.length) {
      return false;
    }
    if (!this.searchResults) {
      const wasClosed = !this.panelIsOpen;
      this.searchResults = this.pickListOrdered;
      this.highlightedIndex = 0;
      this.ensureOutsideDismissListenerSoon();
      if (wasClosed) {
        this.notifyPanelOpened();
      }
      this.scheduleScrollToHighlight();
      return true;
    }
    const len = this.searchResults.length;
    if (len === 0) {
      return false;
    }
    if (this.highlightedIndex < 0) {
      this.highlightedIndex = 0;
    } else {
      this.highlightedIndex = Math.min(this.highlightedIndex + 1, len - 1);
    }
    this.scheduleScrollToHighlight();
    return true;
  }

  handleArrowUp() {
    if (!this.searchResults?.length) {
      return false;
    }
    if (this.highlightedIndex < 0) {
      return false;
    }
    if (this.highlightedIndex <= 0) {
      this.highlightedIndex = -1;
    } else {
      this.highlightedIndex -= 1;
    }
    this.scheduleScrollToHighlight();
    return true;
  }

  handleHomeKey() {
    if (!this.searchResults?.length) {
      return false;
    }
    this.highlightedIndex = 0;
    this.scheduleScrollToHighlight();
    return true;
  }

  handleEndKey() {
    if (!this.searchResults?.length) {
      return false;
    }
    this.highlightedIndex = this.searchResults.length - 1;
    this.scheduleScrollToHighlight();
    return true;
  }

  listboxPageSize() {
    return 5;
  }

  handlePageDownKey() {
    if (!this.searchResults?.length) {
      return false;
    }
    const len = this.searchResults.length;
    const step = this.listboxPageSize();
    if (this.highlightedIndex < 0) {
      this.highlightedIndex = 0;
    } else {
      this.highlightedIndex = Math.min(this.highlightedIndex + step, len - 1);
    }
    this.scheduleScrollToHighlight();
    return true;
  }

  handlePageUpKey() {
    if (!this.searchResults?.length) {
      return false;
    }
    const step = this.listboxPageSize();
    if (this.highlightedIndex < 0) {
      this.highlightedIndex = 0;
    } else {
      this.highlightedIndex = Math.max(this.highlightedIndex - step, 0);
    }
    this.scheduleScrollToHighlight();
    return true;
  }

  handleEnterKey() {
    if (
      !this.searchResults?.length ||
      this.highlightedIndex < 0 ||
      this.highlightedIndex >= this.searchResults.length
    ) {
      return false;
    }
    const row = this.searchResults[this.highlightedIndex];
    this.selectByValue(row.value);
    return true;
  }

  handleEscapeKey() {
    if (!this.searchResults) {
      return false;
    }
    this.clearSearchResults();
    return true;
  }

  /**
   * Scroll active row within the dropdown viewport (Salesforce baseCombobox pattern).
   */
  scrollIntoViewWithin(element, scrollParent) {
    if (!element || !scrollParent) {
      return;
    }
    const parentRect = scrollParent.getBoundingClientRect();
    const elRect = element.getBoundingClientRect();
    if (elRect.top < parentRect.top) {
      scrollParent.scrollTop += elRect.top - parentRect.top;
    } else if (elRect.bottom > parentRect.bottom) {
      scrollParent.scrollTop += elRect.bottom - parentRect.bottom;
    }
  }

  scheduleScrollToHighlight() {
    if (this.highlightedIndex < 0) {
      return;
    }
    requestAnimationFrame(() => {
      const scrollHost = this.template.querySelector("[data-listbox-scroll]");
      const el = this.template.querySelector(
        `[data-option-index="${this.highlightedIndex}"]`,
      );
      if (el && scrollHost) {
        this.scrollIntoViewWithin(el, scrollHost);
      } else {
        el?.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    });
  }

  search(event) {
    if (!this.pickListOrdered) {
      return;
    }
    const rawValue = event?.detail?.value ?? "";
    // Clearing the input (via the built-in clear ('x') button or full delete)
    // clears the current selection and closes the dropdown.
    if (rawValue === "") {
      if (this.selectedSearchResult) {
        this.selectedSearchResult = null;
        this.dispatchChange();
      }
      this.clearSearchResults();
      return;
    }
    const wasOpen = this.panelIsOpen;
    const input = rawValue.toLowerCase();
    const result = this.pickListOrdered.filter((pickListOption) =>
      pickListOption.label.toLowerCase().includes(input),
    );
    this.searchResults = result;
    this.highlightedIndex = -1;
    if (!wasOpen) {
      this.notifyPanelOpened();
    }
    this.ensureOutsideDismissListenerSoon();
  }

  /**
   * Keeps document-level mousedown dismiss from seeing listbox presses. Without
   * this, shadow/event retargeting can mark the target as "outside" and clear
   * the list before the option's click runs.
   */
  suppressListboxMouseDownPropagation(event) {
    event.stopPropagation();
  }

  handleOptionMouseEnter(event) {
    if (!this.searchResults?.length) {
      return;
    }
    const idx = parseInt(event.currentTarget.dataset.optionIndex, 10);
    if (!Number.isNaN(idx)) {
      this.highlightedIndex = idx;
    }
  }

  selectSearchResult(event) {
    const selectedValue = event.currentTarget.dataset.value;
    this.selectByValue(selectedValue);
  }

  selectByValue(value) {
    this.selectedSearchResult = this.pickListOrdered.find(
      (pickListOption) => pickListOption.value === value,
    );
    this.dispatchChange();
    this.clearSearchResults();
  }

  clearSearchResults() {
    this.teardownOutsideDismissListener();
    this.searchResults = null;
    this.highlightedIndex = -1;
    this.notifyPanelClosed();
  }

  /**
   * Opens the list when the field gains focus or receives a pointer down.
   * Focus alone misses the common case: input already focused after the list
   * was closed, or some lightning-input focus paths that differ from label clicks.
   */
  openDropdownIfClosed() {
    if (!this.pickListOrdered || this.searchResults) {
      return;
    }
    const wasClosed = !this.panelIsOpen;
    this.searchResults = this.pickListOrdered;
    this.highlightedIndex = -1;
    if (wasClosed) {
      this.notifyPanelOpened();
    }
    this.ensureOutsideDismissListenerSoon();
  }
}
