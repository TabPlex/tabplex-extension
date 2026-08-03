import { beforeEach, describe, expect, it } from "vitest"

import {
  buildTabplexWebAppUrl,
  getTabplexWebsiteUrl,
  resolveTabplexWebAppBaseUrl
} from "./tabplexUrls"

describe("tabplexUrls", () => {
  beforeEach(() => {
    delete process.env.PLASMO_PUBLIC_WEB_APP_URL
  })

  it("returns Chinese website url for zh languages", () => {
    expect(getTabplexWebsiteUrl("zh-CN")).toBe("https://www.tabplex.com/zh")
    expect(getTabplexWebsiteUrl("zh-TW")).toBe("https://www.tabplex.com/zh")
  })

  it("returns default website url for non-zh languages", () => {
    expect(getTabplexWebsiteUrl("en-US")).toBe("https://www.tabplex.com/")
    expect(getTabplexWebsiteUrl("fr-FR")).toBe("https://www.tabplex.com/")
  })

  it("resolves web app base url with priority: explicit > env > default", () => {
    process.env.PLASMO_PUBLIC_WEB_APP_URL = "https://env.tabplex.com"

    expect(resolveTabplexWebAppBaseUrl("https://custom.tabplex.com")).toBe(
      "https://custom.tabplex.com"
    )
    expect(resolveTabplexWebAppBaseUrl()).toBe("https://env.tabplex.com")

    delete process.env.PLASMO_PUBLIC_WEB_APP_URL
    expect(resolveTabplexWebAppBaseUrl()).toBe("https://tabplex.com")
  })

  it("builds web app url with normalized base and path", () => {
    expect(
      buildTabplexWebAppUrl("pricing", { baseUrl: "https://tabplex.com/" })
    ).toBe("https://tabplex.com/pricing")
    expect(buildTabplexWebAppUrl("", { baseUrl: "https://tabplex.com/" })).toBe(
      "https://tabplex.com/"
    )
  })
})
