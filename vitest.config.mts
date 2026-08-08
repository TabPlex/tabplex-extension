import { dirname, resolve } from "path"
import { fileURLToPath } from "url"
import { configDefaults, defineConfig } from "vitest/config"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineConfig({
  resolve: {
    alias: {
      "url:~assets/workspace-loading.html": resolve(
        __dirname,
        "src/test-utils/workspaceLoadingAssetUrl.ts"
      ),
      "~": resolve(__dirname, "."),
      "~lib": resolve(__dirname, "lib"),
      "~src": resolve(__dirname, "src"),
      "~components": resolve(__dirname, "src/components"),
      "~hooks": resolve(__dirname, "src/hooks"),
      "~styles": resolve(__dirname, "styles"),
      "~core": resolve(__dirname, "src/core"),
      "~features": resolve(__dirname, "src/features"),
      "~shared": resolve(__dirname, "src/shared")
    }
  },
  test: {
    environment: "node",
    exclude: [...configDefaults.exclude, "**/.worktrees/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: [
        "lib/**/*.ts",
        "src/features/**/*.ts",
        "src/background/**/*.ts",
        "src/core/**/*.ts"
      ],
      exclude: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/*.d.ts",
        "src/components/**/*",
        "build/**",
        "node_modules/**",
        "**/*.config.*"
      ],
      thresholds: {
        lines: 30,
        functions: 25,
        branches: 20,
        statements: 30
      }
    }
  }
})
