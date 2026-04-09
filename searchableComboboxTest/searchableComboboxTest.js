import { LightningElement } from "lwc";
import getAccounts from "@salesforce/apex/SearchableComboboxController.getAccounts";

export default class SearchableComboboxTest extends LightningElement {
    accountOptions;
    lastEventType;
    lastChangeDetail;
    isOpen = false;

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
        this.lastChangeDetail = event.detail;
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