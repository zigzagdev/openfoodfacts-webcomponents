import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { FolksonomyEditor } from "./folksonomy-editor"
import type { FolksonomyEditorRow } from "./folksonomy-editor-row"

const api = vi.hoisted(() => ({
  fetchProductProperties: vi.fn(),
  fetchKeys: vi.fn(),
  fetchValues: vi.fn(),
}))

vi.mock("../../api/folksonomy", () => ({ default: api }))

beforeAll(async () => {
  await import("./folksonomy-editor")
})

beforeEach(() => {
  document.body.innerHTML = ""
  api.fetchProductProperties.mockReset().mockResolvedValue([{ k: "color", v: "red", version: 3 }])
  api.fetchKeys.mockReset().mockResolvedValue([])
})

const createEditor = async () => {
  const element = document.createElement("folksonomy-editor") as FolksonomyEditor
  Object.assign(element, { productCode: "3017620422003", pageType: "edit" })
  document.body.appendChild(element)
  await vi.waitFor(() => expect(element.properties).toHaveLength(1))
  await element.updateComplete
  return element
}

const rows = (element: FolksonomyEditor) =>
  Array.from(
    element.shadowRoot!.querySelectorAll<FolksonomyEditorRow>("folksonomy-editor-row:not([empty])")
  )

describe("folksonomy-editor", () => {
  it("passes the product's keys to the new-property row", async () => {
    const element = await createEditor()
    const emptyRow = element.shadowRoot!.querySelector<FolksonomyEditorRow>(
      "folksonomy-editor-row[empty]"
    )!

    expect(emptyRow.existingKeys).toEqual(["color"])
  })

  it("does not list a key twice when an add-row event repeats an existing key", async () => {
    const element = await createEditor()

    element.dispatchEvent(new CustomEvent("add-row", { detail: { key: "color", value: "blue" } }))
    await element.updateComplete

    expect(rows(element).map((row) => [row.key, row.value])).toEqual([["color", "blue"]])
  })
})
