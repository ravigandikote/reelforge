import { registerRoot } from 'remotion'
import { RemotionRoot } from './Root.js'

// This file is the Remotion entry point: importing it registers the
// compositions. Node-side consumers want '@reelforge/video/render' instead,
// which pulls in the renderer without booting the Remotion root.
registerRoot(RemotionRoot)
