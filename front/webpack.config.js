
const path = require( 'path' );

const HTMLWebpackPlugin = require( 'html-webpack-plugin' );
const VueLoaderPlugin = require( 'vue-loader/lib/plugin' );

module.exports = {

  context: path.resolve( __dirname, 'src' ),
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',

  entry: './js/index.js',
  output: {

    path: path.resolve( __dirname, 'dist' ),
    filename: 'bundle.js',

  },

  module: {

    rules: [

      {

        test: /\.html$/,
        use: 'html-loader',

      },

      {

        test: /\.css$/,
        use: [
          'style-loader',
          'css-loader',
        ],

      },

      {

        test: /\.scss$/,
        use: [

          'vue-style-loader',
          'css-loader',
          'sass-loader',

        ],

      },

      {

        test: /\.vue$/,
        loader: 'vue-loader',
        options: {

          loaders: {
            scss: [
              'vue-style-loader',
              'css-loader',
              'sass-loader'
            ],
          }

        }

      },

    ]

  },

  resolve: {

    alias: {

      'vue$': 'vue/dist/vue.esm.js',

    },

  },

  plugins: [

    new HTMLWebpackPlugin( { template: './index.html', inject: false, } ),
    new VueLoaderPlugin(),

  ],

};
