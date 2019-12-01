// See http://brunch.io for documentation.
exports.files = {
  javascripts: {
    joinTo: {
      'vendor.js': /^(?!app)/, // Files that are not in `app` dir.
      'app.js': /^app/
    }
  },
  stylesheets: {joinTo: 'app.css'}
};

exports.plugins = {
  postcss: {
    processors: [
      require('autoprefixer')(),
    ],
  },
  pug: {
    staticPretty: false,
    preCompilePattern: /\.pug$/,
  },
};

exports.watcher = {
  usePolling: true,
  awaitWriteFinish: true,
}
