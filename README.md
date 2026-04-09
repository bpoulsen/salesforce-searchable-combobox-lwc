# Salesforce Searchable Combobox (LWC)

A reusable Lightning Web Component, `c-searchable-combobox`, that provides a **single-select combobox with built-in search/filtering**.

## Purpose

Salesforce’s standard `lightning-combobox` does not provide an out-of-the-box “type to filter” experience for large option sets. This component fills that gap while keeping the UI consistent with Lightning Design System (SLDS).

## How it works

- **Input**: Uses the standard `lightning-input` component configured as `type="search"` for a familiar search field UX (including the native clear button).
- **Dropdown UI**: Renders the option list using the **SLDS combobox/listbox markup pattern**, so the dropdown closely matches Salesforce styling (including a checkmark indicator for the selected option).
- **Open behavior**: When the input is focused/clicked, the component opens the dropdown and shows the available options (similar to a standard combobox).
- **Filtering**: As the user types, the dropdown list is filtered using a **case-insensitive substring match** against each option label.

## Public API

`c-searchable-combobox` is designed to be data-source agnostic. Parents provide options in the standard `{ label, value }` shape.

- `**label`\*\* (String): Display label for the field.
- `**name`\*\* (String): Included in change event payloads (useful for forms).
- `**placeholder**` (String): Placeholder text for the search input.
- `**options**` (Array): Array of `{ label: string, value: string }`.

## Events

All events bubble and are composed so parent components can listen normally.

- `**change**`: Fired when a user selects an option or clears the selection.
  - `event.detail`: `{ name, value, label }`
  - `value`/`label` are `undefined` when cleared.
- `**open**`: Fired when the options dropdown opens.
- `**close**`: Fired when the options dropdown closes.

## Keyboard support

With focus in the input:

- **ArrowDown**: open dropdown (if closed) and highlight the first option; move highlight down
- **ArrowUp**: move highlight up
- **Home / End**: jump to first / last option
- **PageUp / PageDown**: jump by a small page
- **Enter**: select the highlighted option
- **Escape**: close the dropdown

## Example usage

```html
<c-searchable-combobox
  label="Account"
  name="accountId"
  placeholder="Search accounts"
  options="{accountOptions}"
  onchange="{handleAccountChange}"
  onopen="{handleOpen}"
  onclose="{handleClose}"
>
</c-searchable-combobox>
```

```js
accountOptions = [
  { label: 'Acme', value: '001...' },
  { label: 'Global Media', value: '001...' }
];

handleAccountChange(event) {
  const { name, value, label } = event.detail;
  // name  -> "accountId"
  // value -> selected record Id (e.g., "001...")
  // label -> selected record name
}
```
