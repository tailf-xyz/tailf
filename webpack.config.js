// /*
//     ./webpack.config.js
// */
// const path = require('path');
//
// const webpack = require('webpack');
// // const HtmlWebpackPlugin = require('html-webpack-plugin');
// // const HtmlWebpackPluginConfig = new HtmlWebpackPlugin({
// //   template: './client/index.html',
// //   filename: 'index.html',
// //   inject: 'body'
// // })
//
// let conf = {
//   module: {
//     loaders: [
//       { test: /\.js$/, loader: 'babel-loader' },
//       { test: /\.jsx$/, loader: 'babel-loader' },
//       { test: /\.css$/, loader: "style-loader!css-loader" },
//       { test: /\.png$/, loader: "url-loader?limit=100000" },
//       { test: /\.jpg$/, loader: "file-loader" },
//       { test: /\.(woff|woff2)(\?v=\d+\.\d+\.\d+)?$/, loader: 'url-loader?limit=80000&mimetype=application/font-woff' },
//       { test: /\.ttf(\?v=\d+\.\d+\.\d+)?$/, loader: 'url-loader?limit=80000&mimetype=application/octet-stream' },
//       { test: /\.eot(\?v=\d+\.\d+\.\d+)?$/, loader: 'file-loader' },
//       { test: /\.svg(\?v=\d+\.\d+\.\d+)?$/, loader: 'url-loader?limit=80000&mimetype=image/svg+xml' }
//     ]
//   },
//   plugins: [
//     // HtmlWebpackPluginConfig,
//     new webpack.ProvidePlugin({
//         $: 'jquery',
//         jQuery: 'jquery',
//         'window.jQuery': 'jquery',
//         Popper: ['popper.js', 'default'],
//         // In case you imported plugins individually, you must also require them here:
//         Util: "exports-loader?Util!bootstrap/js/dist/util",
//         Dropdown: "exports-loader?Dropdown!bootstrap/js/dist/dropdown"
//       })
//   ],
//   node: {
//    fs: 'empty'
//   },
//   resolve: {
//     alias: {
//       // https://github.com/lorenwest/node-config/wiki/Webpack-Usage
//       config: path.resolve(__dirname, 'config/default.json')
//       // url: 'universal-url'
//     }
//   }
// }
//
// let lib = Object.assign({}, conf, {
//   entry: './node_modules/tailf.io-sdk-web/client/embed.js',
//   output: {
//     path: path.resolve('public/js'),
//     filename: 'lib.js',
//     libraryTarget: 'var',
//     library: 'Tailf'
//   }
// })
//
// module.exports = [
//   lib
// ]

const path = require('path');

module.exports = {
  entry: './public/js/index.js',
  output: {
    libraryTarget: 'var',
    library: 'Tailf',
    // libraryExport: 'Breadboard',
    filename: 'lib.js',
    path: path.resolve(__dirname, 'public/js')
  }
};
