import { LightningElement } from "lwc";
import getAccounts from "@salesforce/apex/SearchableComboboxController.getAccounts";

export default class SearchableComboboxTest extends LightningElement {
  accountOptions;
  lastEventType;
  lastChangeDetail;
  isOpen = false;

  /** Avoid {obj.name} / {obj.value} in HTML — those identifiers are ambiguous in LWC templates. */
  get hasLastChangeDetail() {
    return this.lastChangeDetail != null;
  }

  get lastChangeDetailName() {
    return this.lastChangeDetail?.name;
  }

  get lastChangeDetailValue() {
    return this.lastChangeDetail?.value;
  }

  get lastChangeDetailLabel() {
    return this.lastChangeDetail?.label;
  }

  connectedCallback() {
    getAccounts()
      .then((result) => {
        this.accountOptions = result;
      })
      .catch((error) => {
        console.error("getAccounts failed", error);
      });
  }

  handleAccountChange(event) {
    this.lastEventType = "change";
    this.lastChangeDetail = event.detail ? { ...event.detail } : undefined;
  }

  handleOpen() {
    this.isOpen = true;
    this.lastEventType = "open";
  }

  handleClose() {
    this.isOpen = false;
    this.lastEventType = "close";
  }
}
