module.exports = {
  input: "./src/find-edits.js",
  output: {format: "cjs", file: "dist/find-edits.js"},
  sourcemap: true,
  plugins: [require("rollup-plugin-buble")()],
  external(id) { return !/^[\.\/]/.test(id) }
}
