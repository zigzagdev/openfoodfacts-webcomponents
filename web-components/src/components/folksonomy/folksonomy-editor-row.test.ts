import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { FolksonomyEditorRow } from "./folksonomy-editor-row"

const api = vi.hoisted(() => ({
  fetchKeys: vi.fn(),
  fetchValues: vi.fn(),
  addProductProperty: vi.fn(),
  updateProductProperty: vi.fn(),
  deleteProductProperty: vi.fn(),
}))

vi.mock("../../api/folksonomy", () => ({ default: api }))

beforeAll(async () => {
  await import("./folksonomy-editor-row")
})

beforeEach(() => {
  document.body.innerHTML = ""
  api.fetchKeys.mockReset().mockResolvedValue([])
  api.fetchValues.mockReset().mockResolvedValue([])
  api.addProductProperty.mockReset()
  api.updateProductProperty.mockReset()
  api.deleteProductProperty.mockReset()
  vi.spyOn(console, "error").mockImplementation(() => {})
})

const createRow = async (props: Partial<FolksonomyEditorRow>) => {
  const element = document.createElement("folksonomy-editor-row") as FolksonomyEditorRow
  Object.assign(element, { productCode: "3017620422003", pageType: "edit", ...props })
  // A row only lives inside the editor's table.
  const table = document.createElement("table")
  table.appendChild(element)
  document.body.appendChild(table)
  await element.updateComplete
  return element
}

const button = (element: FolksonomyEditorRow, label: string) =>
  Array.from(element.shadowRoot!.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === label
  )!

const alertText = (element: FolksonomyEditorRow) =>
  element.shadowRoot!.querySelector("[role=alert]")?.textContent?.trim()

const typeInto = (input: Element, value: string) => {
  ;(input as HTMLInputElement).value = value
  input.dispatchEvent(new CustomEvent("input-change", { detail: { value, matching: false } }))
}

const fillNewRow = async (element: FolksonomyEditorRow, key: string, value: string) => {
  const [keyInput, valueInput] = element.shadowRoot!.querySelectorAll("autocomplete-input")
  typeInto(keyInput, key)
  typeInto(valueInput, value)
  await element.updateComplete
}

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe("folksonomy-editor-row: editing an existing property", () => {
  it("shows an error and keeps the row editable when saving fails", async () => {
    api.updateProductProperty.mockRejectedValue(new Error("HTTP error! status: 500"))
    const element = await createRow({ key: "color", value: "red", version: 1 })

    button(element, "Save").click()
    await vi.waitFor(() =>
      expect(alertText(element)).toBe("Could not save the property. Please try again.")
    )

    expect(button(element, "Save").disabled).toBe(false)
  })

  it("sends a single update when Save is clicked twice", async () => {
    const pending = deferred<{ key: string; value: string; version: number }>()
    api.updateProductProperty.mockReturnValue(pending.promise)
    const element = await createRow({ key: "color", value: "red", version: 1 })

    button(element, "Save").click()
    await element.updateComplete
    expect(button(element, "Save").disabled).toBe(true)
    button(element, "Save").click()

    pending.resolve({ key: "color", value: "red", version: 2 })
    await vi.waitFor(() => expect(element.editable).toBe(false))
    expect(api.updateProductProperty).toHaveBeenCalledTimes(1)
  })

  it("refuses to save an empty value", async () => {
    const element = await createRow({ key: "color", value: "red", version: 1 })
    const input = element.shadowRoot!.querySelector<HTMLInputElement>("input.input")!
    input.value = "   "
    input.dispatchEvent(new Event("input"))

    button(element, "Save").click()
    await element.updateComplete

    expect(api.updateProductProperty).not.toHaveBeenCalled()
    expect(alertText(element)).toBe("Please enter a value.")
  })

  it("shows an error and keeps the row when deleting fails", async () => {
    api.deleteProductProperty.mockRejectedValue(new Error("HTTP error! status: 500"))
    const element = await createRow({ key: "color", value: "red", version: 1 })
    const onDelete = vi.fn()
    element.addEventListener("delete-row", onDelete)

    button(element, "Delete").click()
    document.querySelector("delete-modal")!.dispatchEvent(new CustomEvent("confirm-delete"))
    await vi.waitFor(() =>
      expect(alertText(element)).toBe("Could not delete the property. Please try again.")
    )

    expect(onDelete).not.toHaveBeenCalled()
    expect(document.querySelector("delete-modal")).toBeNull()
  })
})

describe("folksonomy-editor-row: adding a property", () => {
  it("asks for both a key and a value", async () => {
    const element = await createRow({ empty: true })
    await fillNewRow(element, "color", "")

    button(element, "Submit").click()
    await element.updateComplete

    expect(api.addProductProperty).not.toHaveBeenCalled()
    expect(alertText(element)).toBe("Please enter a key and a value.")
  })

  it("refuses a key the product already has", async () => {
    const element = await createRow({ empty: true, existingKeys: ["color"] })
    await fillNewRow(element, "color", "blue")

    button(element, "Submit").click()
    await element.updateComplete

    expect(api.addProductProperty).not.toHaveBeenCalled()
    expect(alertText(element)).toBe(
      "This property already exists for this product. Edit it instead."
    )
  })

  it("shows an error and keeps the input when adding fails", async () => {
    api.addProductProperty.mockRejectedValue(new Error("HTTP error! status: 422"))
    const element = await createRow({ empty: true })
    await fillNewRow(element, "color", "blue")

    button(element, "Submit").click()
    await vi.waitFor(() =>
      expect(alertText(element)).toBe("Could not add the property. Please try again.")
    )

    const [keyInput] = element.shadowRoot!.querySelectorAll("autocomplete-input")
    expect((keyInput as HTMLInputElement).value).toBe("color")
  })

  it("sends a single request when Submit is clicked twice", async () => {
    const pending = deferred<{ key: string; value: string; version: number }>()
    api.addProductProperty.mockReturnValue(pending.promise)
    const element = await createRow({ empty: true })
    const onAdd = vi.fn()
    element.addEventListener("add-row", onAdd)
    await fillNewRow(element, "color", "blue")

    button(element, "Submit").click()
    button(element, "Submit").click()
    pending.resolve({ key: "color", value: "blue", version: 1 })
    await vi.waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1))

    expect(api.addProductProperty).toHaveBeenCalledTimes(1)
    expect(api.addProductProperty).toHaveBeenCalledWith("3017620422003", "color", "blue", 1)
  })
})
