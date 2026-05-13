# Salesforce Searchable Combobox (LWC)

A reusable Lightning Web Component, `c-searchable-combobox`, that provides a single-select combobox with built-in search/filtering for large option sets and a native Salesforce combobox fallback for smaller lists.

## Purpose

Salesforce's standard `lightning-combobox` is a good fit for short option lists, but it does not provide an out-of-the-box "type to filter" experience for larger sets. This component adapts between both experiences while keeping a consistent parent-facing API.

## How It Works

- **Adaptive rendering**: Uses `lightning-combobox` when `options.length <= searchThreshold`, and the custom searchable combobox when `options.length > searchThreshold`.
- **Search input**: Uses `lightning-input` with `type="search"` in searchable mode for a familiar search field UX, including the native clear button.
- **Dropdown UI**: Renders the searchable option list with the SLDS combobox/listbox pattern, including a checkmark for the selected option.
- **Filtering**: Filters options using a case-insensitive substring match against each option label.
- **Selection state**: Keeps the selected option in shared component state, so the selection is preserved if reactive `options` or `searchThreshold` changes switch rendering modes.
- **Deferred value resolution**: Parents can set `value` before `options` loads. The component stores the pending value and resolves it automatically when options arrive, eliminating race-condition workarounds common with Apex data sources.

## Public API

`c-searchable-combobox` is data-source agnostic. Parents provide options in the standard `{ label, value }` shape.

- **`label`** (String): Display label for the field. Defaults to `"Searchable Combobox"`.
- **`name`** (String): Included in `change` event payloads, which is useful for forms.
- **`placeholder`** (String): Placeholder text for the input. Defaults to `"Search"`.
- **`options`** (Array): Array of `{ label: string, value: string }` options.
- **`value`** (String): The currently selected option value. Supports deferred resolution — if set before `options` has loaded (e.g. from an Apex call), the value is held internally and resolved automatically once `options` arrives. Reading `value` returns the selected option's value or `null`.
- **`searchThreshold`** (Number): Maximum option count that should render the native `lightning-combobox`. Defaults to `10`.
- **`clear()`** (Function): Imperative API that clears the current selection and closes the searchable dropdown when it is open.

## Adaptive Rendering

By default, lists with 10 or fewer options render as a standard Salesforce `lightning-combobox`. Lists with more than 10 options render the searchable combobox. Set `search-threshold` in markup, or `searchThreshold` in JavaScript, to tune the crossover point.

The native fallback keeps the same parent-facing `change` detail shape as the searchable path:

```js
{
  name,
  value,
  label
}
```

In native mode, `open` and `close` events are fired on focus and blur as a best-effort proxy because `lightning-combobox` does not expose dropdown lifecycle events. Undefined or non-array `options` stay on the searchable path until data arrives.

## Events

All custom events bubble and are composed so parent components can listen normally.

- **`change`**: Fired when a user selects an option or clears the selection. `event.detail` is `{ name, value, label }`; `value` and `label` are `undefined` when cleared.
- **`open`**: Fired when the searchable dropdown opens. In native mode, fired when the combobox receives focus.
- **`close`**: Fired when the searchable dropdown closes. In native mode, fired when the combobox loses focus.

## Keyboard Support

With focus in the searchable input:

- **ArrowDown**: Open the dropdown if closed, highlight the first option, or move the highlight down.
- **ArrowUp**: Move the highlight up.
- **Home / End**: Jump to the first or last option.
- **PageUp / PageDown**: Jump by a small page.
- **Enter**: Select the highlighted option.
- **Escape**: Close the dropdown.

Native mode uses the keyboard behavior provided by `lightning-combobox`.

## Example Usage

```html
<c-searchable-combobox
  label="Account"
  name="accountId"
  placeholder="Search accounts"
  options={accountOptions}
  onchange={handleAccountChange}
  onopen={handleOpen}
  onclose={handleClose}
>
</c-searchable-combobox>
```

```js
accountOptions = [
  { label: "Acme", value: "001..." },
  { label: "Global Media", value: "001..." },
];

handleAccountChange(event) {
  const { name, value, label } = event.detail;
  // name  -> "accountId"
  // value -> selected record Id (e.g., "001...")
  // label -> selected record name
}
```

## Tuning `searchThreshold`

Force the searchable UI for any non-empty list by setting the threshold to `0`:

```html
<c-searchable-combobox
  label="Status"
  name="status"
  options={statusOptions}
  search-threshold="0"
  onchange={handleStatusChange}
>
</c-searchable-combobox>
```

Prefer the native `lightning-combobox` for larger lists by setting a higher threshold:

```html
<c-searchable-combobox
  label="Status"
  name="status"
  options={statusOptions}
  search-threshold="25"
  onchange={handleStatusChange}
>
</c-searchable-combobox>
```

## Deferred Value Resolution

When `value` is set before `options` has loaded — a common pattern when the parent binds a record field while picklist data is still in flight from Apex — the component stores the value internally and resolves it once `options` arrives.

```html
<c-searchable-combobox
  label="Account"
  name="accountId"
  value={record.AccountId}
  options={accountOptions}
  onchange={handleAccountChange}
>
</c-searchable-combobox>
```

No extra parent-side timing logic is needed. If `record.AccountId` resolves before `accountOptions`, the selection is deferred. If `accountOptions` resolves first, the `value` setter finds the match immediately.
