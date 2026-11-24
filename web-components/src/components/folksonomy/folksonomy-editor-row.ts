import { LitElement, html, css } from "lit"
import { customElement, property, state } from "lit/decorators.js"
import "./delete-modal"
import "./new-key-modal"
import "../shared/autocomplete-input"
import folksonomyApi from "../../api/folksonomy"
import { FOLKSONOMY_THEME } from "../../styles/folksonomy-theme"
import { msg, localized } from "@lit/localize"
import { getButtonClasses, ButtonType } from "../../styles/buttons"
import { FOLKSONOMY_INPUT } from "../../styles/folksonomy-input"
import type {
  AutocompleteSuggestion,
  AutocompleteInputChangeEvent,
  AutocompleteSuggestionSelectEvent,
} from "../../types"

/**
 * FolksonomyEditorRow Component
 * @element folksonomy-editor-row
 * @description A component for adding and editing product properties in a table row format.
 * @fires update-row - Fired when a row is updated.
 * @fires delete-row - Fired when a row is deleted.
 * @fires add-row - Fired when a new row is added.
 */
@localized()
@customElement("folksonomy-editor-row")
export class FolksonomyEditorRow extends LitElement {
  /**
   * Input value for the key field.
   * @private
   */
  @state() private keyInput = ""

  /**
   * Input value for the value field.
   * @private
   */
  @state() private valueInput = ""

  /**
   * Suggestions for the key field.
   * @private
   */
  @state() private keySuggestions: AutocompleteSuggestion[] = []

  /**
   * Suggestions for the value field.
   * @private
   */
  @state() private valueSuggestions: AutocompleteSuggestion[] = []

  /**
   * Temporary value used during editing.
   * @private
   */
  @state() private tempValue = ""

  /**
   * Product code associated with the row.
   */
  @property({ type: String, attribute: "product-code" }) productCode = ""

  /**
   * Version number of the product property.
   */
  @property({ type: Number }) version = 1

  /**
   * Row number in the table.
   */
  @property({ type: Number, attribute: "row-number" }) rowNumber = 1

  /**
   * Key of the product property.
   */
  @property({ type: String }) key = ""

  /**
   * Value of the product property.
   */
  @property({ type: String }) value = ""

  /**
   * Page type (e.g., view or edit).
   */
  @property({ type: String, attribute: "page-type" }) pageType = "view"

  /**
   * Indicates whether the row is empty.
   */
  @property({ type: Boolean }) empty = false

  /**
   * Keys already set on the product, used by the empty row to refuse a duplicate key.
   */
  @property({ attribute: false }) existingKeys: string[] = []

  /**
   * Whether a request to the API is in progress. Buttons are disabled meanwhile
   * so that a double click does not send the request twice.
   * @private
   */
  @state() private isSubmitting = false

  /**
   * Message shown to the user when an action fails or the input is invalid.
   * @private
   */
  @state() private errorMessage = ""

  /**
   * Indicates whether the row is editable.
   * @private
   */
  @state() editable = false

  /**
   * Indicates whether the new key modal is open.
   * @private
   */
  @state() showNewKeyModal = false

  override connectedCallback() {
    super.connectedCallback()
    if (this.pageType === "edit") {
      this.editable = true
      this.tempValue = this.value
    }

    folksonomyApi
      .fetchKeys()
      .then((keys) => {
        this.keySuggestions = keys.map((key) => ({
          value: key.k,
          count: key.count,
        }))
      })
      .catch((error) => console.error("Error fetching keys:", error))
  }

  /**
   * Fetches values for a given key and updates suggestions.
   * @param key - The key to fetch values for.
   * @private
   */
  private async fetchValuesForKey(key: string) {
    try {
      const values = await folksonomyApi.fetchValues(key)
      this.valueSuggestions = values.map((value) => ({
        value: value.v,
      }))
    } catch (error) {
      console.error("Error fetching values for key:", error)
    }
  }

  /**
   * Handles input changes for the key field.
   * @param e - The input event.
   * @private
   */
  private onKeyInput(e: AutocompleteInputChangeEvent) {
    const value = (e.target as HTMLInputElement).value
    this.keyInput = value
    this.key = value
    this.errorMessage = ""

    if (e.detail.matching) {
      this.fetchValuesForKey(value)
    }
  }

  /**
   * Handles input changes for the value field.
   * @param e - The input event.
   * @private
   */
  private onValueInput(e: AutocompleteInputChangeEvent) {
    const value = e.detail.value
    this.valueInput = value
    this.value = value
    this.errorMessage = ""

    // In case of input value match exactly with only one suggestion, fetch values for the key
    if (e.detail.matching) {
      this.fetchValuesForKey(this.keyInput)
    }
  }

  /**
   * Selects a key suggestion and updates the key field.
   * @param suggestion - The selected key suggestion.
   * @private
   */
  private selectKeySuggestion(suggestion: string) {
    // Check if this is the "not found" option
    if (suggestion === "__NOT_FOUND__") {
      this.showNewKeyModal = true
      return
    }

    const hasChanged = this.keyInput !== suggestion
    // Avoid calling fetchValuesForKey if the key has not changed
    if (!hasChanged) {
      return
    }
    this.keyInput = suggestion
    this.key = suggestion
    this.valueInput = ""
    this.value = ""
    this.fetchValuesForKey(suggestion)
  }

  /**
   * Selects a value suggestion and updates the value field.
   * @param suggestion - The selected value suggestion.
   * @private
   */
  private selectValueSuggestion(suggestion: string) {
    this.valueInput = suggestion
    this.value = suggestion
  }

  /**
   * Enables editing mode for the row.
   * @private
   */
  private handleEdit() {
    this.editable = true
    this.tempValue = this.value
  }

  /**
   * Saves the edited property and dispatches an update-row event.
   * @private
   */
  private async handleSave() {
    if (this.isSubmitting) {
      return
    }
    const value = this.tempValue.trim()
    if (!value) {
      this.errorMessage = msg("Please enter a value.")
      return
    }
    this.isSubmitting = true
    this.errorMessage = ""
    try {
      const updatedProperty = await folksonomyApi.updateProductProperty(
        this.productCode,
        this.key,
        value,
        this.version
      )
      this.editable = false

      this.dispatchEvent(
        new CustomEvent("update-row", {
          detail: {
            key: updatedProperty.key,
            value: updatedProperty.value,
            version: updatedProperty.version,
          },
          bubbles: true,
          composed: true,
        })
      )
    } catch (error) {
      console.error("Failed to update property", error)
      this.errorMessage = msg("Could not save the property. Please try again.")
    } finally {
      this.isSubmitting = false
    }
  }

  /**
   * Cancels editing mode and restores the original value.
   * @private
   */
  private handleCancel() {
    this.editable = false
    this.tempValue = this.value
    this.errorMessage = ""
  }

  /**
   * Deletes the property and dispatches a delete-row event.
   * @private
   */
  private async handleDelete() {
    if (this.isSubmitting) {
      return
    }
    const deleteModal = document.createElement("delete-modal")
    deleteModal.addEventListener("confirm-delete", async () => {
      if (this.isSubmitting) {
        return
      }
      this.isSubmitting = true
      this.errorMessage = ""
      try {
        await folksonomyApi.deleteProductProperty(this.productCode, this.key, this.version)
        this.dispatchEvent(
          new CustomEvent("delete-row", {
            detail: { key: this.key },
            bubbles: true,
            composed: true,
          })
        )
      } catch (error) {
        console.error("Failed to delete property", error)
        this.errorMessage = msg("Could not delete the property. Please try again.")
      } finally {
        this.isSubmitting = false
        deleteModal.remove()
      }
    })
    document.body.appendChild(deleteModal)
  }

  /**
   * Adds a custom key and value to the product properties.
   * @private
   */
  private async addCustomKeyAndValue() {
    if (this.isSubmitting) {
      return
    }
    const key = this.keyInput.trim()
    const value = this.valueInput.trim()
    if (!key || !value) {
      this.errorMessage = msg("Please enter a key and a value.")
      return
    }
    if (this.existingKeys.includes(key)) {
      this.errorMessage = msg("This property already exists for this product. Edit it instead.")
      return
    }
    this.isSubmitting = true
    this.errorMessage = ""
    try {
      const newProperty = await folksonomyApi.addProductProperty(
        this.productCode,
        key,
        value,
        this.version
      )
      this.dispatchEvent(
        new CustomEvent("add-row", {
          detail: { key: newProperty.key, value: newProperty.value },
          bubbles: true,
          composed: true,
        })
      )
      this.keyInput = ""
      this.valueInput = ""
    } catch (error) {
      console.error("Failed to add custom key and value", error)
      this.errorMessage = msg("Could not add the property. Please try again.")
    } finally {
      this.isSubmitting = false
    }
  }

  /**
   * Handles input changes during editing.
   * @param e - The input event.
   * @private
   */
  private handleInputChange(e: Event) {
    this.tempValue = (e.target as HTMLInputElement).value
    this.errorMessage = ""
  }

  /**
   * Handles closing the new key modal.
   * @private
   */
  private handleCloseNewKeyModal() {
    this.showNewKeyModal = false
  }

  static override styles = [
    FOLKSONOMY_THEME,
    FOLKSONOMY_INPUT,
    ...getButtonClasses([ButtonType.Chocolate]),
    css`
      :host {
        font-family: Arial, sans-serif;
        font-size: 0.9rem;
        color: var(--off-folksonomy-text, #333);
        width: 100%;
        display: contents;
      }

      .odd-row {
        background-color: var(--off-folksonomy-bg, #ffffff);
      }

      .even-row {
        background-color: var(--off-folksonomy-row-even-bg-alt, #f2f2f2);
      }

      .button-container {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        width: 10rem;
      }

      .button-container button {
        width: 10rem;
      }

      td {
        padding: 0.5rem 1.2rem;
        text-align: left;
        border: none;
      }
      tr:not(.empty-row) td {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .property-link {
        color: var(--off-folksonomy-text, black);
      }

      tr.error-row td {
        padding-top: 0;
        white-space: normal;
      }

      .error-message {
        color: var(--off-folksonomy-danger, #c62828);
        font-weight: 600;
      }

      #create-button {
        width: 10rem;
        padding: 0.4rem 0.8rem;
      }

      @media (max-width: 768px) {
        .button-container {
          flex-direction: column;
        }

        .button-container {
          width: 7rem;
        }

        .button-container button {
          font-size: 0.8rem;
          padding: 0.4rem 0.8rem;
          height: 2rem;
          width: 7rem;
        }

        #create-button {
          font-size: 0.8rem;
          padding: 0.4rem 0.8rem;
          height: 2rem;
          width: 7rem;
        }
      }

      @media (max-width: 480px) {
        .button-container {
          width: 5rem;
        }

        .button-container button {
          width: 5rem;
          font-size: 0.7rem;
          padding: 0.3rem 0.5rem;
          height: 1.6rem;
        }

        #create-button {
          width: 5rem;
          font-size: 0.7rem;
          padding: 0.3rem 0.5rem;
          height: 1.6rem;
        }

        td {
          padding: 0.4rem 0.5rem;
        }
      }
      autocomplete-input::part(autocomplete-input-list) {
        position: relative !important;
      }
    `,
  ]

  private isUrl(value: string): boolean {
    const trimmedValue = value.trim()
    if (!trimmedValue) {
      return false
    }

    try {
      const url = new URL(trimmedValue)
      return url.protocol === "http:" || url.protocol === "https:"
    } catch {
      return false
    }
  }

  private confirmExternalNavigation(e: Event) {
    const confirmed = confirm(msg("You are about to visit an external website. Continue?"))
    if (!confirmed) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  private renderError() {
    if (!this.errorMessage) {
      return null
    }
    return html`
      <tr class="error-row ${this.rowNumber % 2 === 0 ? "even-row" : "odd-row"}">
        <td colspan="3">
          <span class="error-message" role="alert">${this.errorMessage}</span>
        </td>
      </tr>
    `
  }

  override render() {
    if (this.empty) {
      return html`
        <tr class="empty-row ${this.rowNumber % 2 === 0 ? "even-row" : "odd-row"}">
          <td>
            <autocomplete-input
              placeholder=${msg("New key")}
              .value=${this.keyInput}
              .suggestions=${this.keySuggestions}
              show-not-found-option
              not-found-text=${msg("Not found? Create new key {value}")}
              @input-change=${(e: AutocompleteInputChangeEvent) => this.onKeyInput(e)}
              @suggestion-select=${(e: AutocompleteSuggestionSelectEvent) =>
                this.selectKeySuggestion(e.detail.value)}
            ></autocomplete-input>
          </td>
          <td>
            <autocomplete-input
              placeholder=${msg("New value")}
              .value=${this.valueInput}
              .suggestions=${this.valueSuggestions}
              @input-change=${(e: AutocompleteInputChangeEvent) => this.onValueInput(e)}
              @suggestion-select=${(e: AutocompleteSuggestionSelectEvent) =>
                this.selectValueSuggestion(e.detail.value)}
            ></autocomplete-input>
          </td>
          <td>
            <div class="button-container">
              <button
                class="button chocolate-button"
                @click=${this.addCustomKeyAndValue}
                id="create-button"
                ?disabled=${this.isSubmitting}
              >
                ${msg("Submit")}
              </button>
            </div>
          </td>
        </tr>
        ${this.renderError()}
        ${
          this.showNewKeyModal
            ? html`<new-key-modal @close-modal=${this.handleCloseNewKeyModal}></new-key-modal>`
            : null
        }
      `
    }

    return html`
      <tr class="${this.rowNumber % 2 === 0 ? "even-row" : "odd-row"}">
        <td>
          <a
            class="property-link"
            href="https://wiki.openfoodfacts.org/Folksonomy/Property/${this.key}"
            >${this.key}</a
          >
        </td>
        <td>
          ${
            this.editable
              ? html`<input
                  type="text"
                  class="input"
                  .value=${this.tempValue}
                  @input=${this.handleInputChange}
                />`
              : this.isUrl(this.value)
                ? html`
                    <a
                      href=${this.value}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      @click=${this.confirmExternalNavigation}
                      @auxclick=${this.confirmExternalNavigation}
                    >
                      ${this.value}
                    </a>
                  `
                : this.value
          }
        </td>
        ${
          this.pageType == "edit"
            ? html`<td>
                <div class="button-container">
                  ${
                    this.editable
                      ? html`
                          <button
                            class="button chocolate-button"
                            @click=${this.handleSave}
                            ?disabled=${this.isSubmitting}
                          >
                            ${msg("Save")}
                          </button>
                          <button
                            class="button chocolate-button"
                            @click=${this.handleCancel}
                            ?disabled=${this.isSubmitting}
                          >
                            ${msg("Cancel")}
                          </button>
                        `
                      : html`<button
                          class="button chocolate-button"
                          @click=${this.handleEdit}
                          ?disabled=${this.isSubmitting}
                        >
                          ${msg("Edit")}
                        </button>`
                  }
                  <button
                    class="button chocolate-button"
                    @click=${this.handleDelete}
                    ?disabled=${this.isSubmitting}
                  >
                    ${msg("Delete")}
                  </button>
                </div>
              </td>`
            : null
        }
      </tr>
      ${this.renderError()}
      ${
        this.showNewKeyModal
          ? html`<new-key-modal @close-modal=${this.handleCloseNewKeyModal}></new-key-modal>`
          : null
      }
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "folksonomy-editor-row": FolksonomyEditorRow
  }
}
