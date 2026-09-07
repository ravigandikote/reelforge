import { Config } from '@remotion/cli/config'
import { webpackOverride } from './src/webpack.js'

// Asset paths in the props are relative to the media library, which is what
// staticFile() resolves against in both the studio and a headless render.
Config.setPublicDir('../../media')
Config.setVideoImageFormat('jpeg')
Config.setOverwriteOutput(true)
Config.setChromiumOpenGlRenderer('angle')
Config.overrideWebpackConfig(webpackOverride)
