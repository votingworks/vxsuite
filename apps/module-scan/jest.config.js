module.exports = {
  "roots": [
    "<rootDir>/src"
  ],
  "transform": {
    "^.+\\.tsx?$": "ts-jest"
  },
  "collectCoverageFrom": [
    "**/*.{ts,tsx}",
    "!**/node_modules/**",
    "!src/index.ts",
    "!src/types.ts"    
  ]
}
