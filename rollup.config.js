module.exports = {
  input: "./src/changeset.js",
  output: {format: "cjs", file: "dist/changeset.js"},
  sourcemap: true,
  plugins: [require("rollup-plugin-buble")()],
  external(id) { return !/^[\.\/]/.test(id) }
}
