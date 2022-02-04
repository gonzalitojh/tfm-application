import * as renderFunc from './renderFunctions.js';

const canvas = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvas, true);

// Create whole MR scene
const createScene = async function () {
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color3.Black; // Set color black for empty scene

    const xr = await scene.createDefaultXRExperienceAsync({
        uiOptions: {
            sessionMode: "immersive-ar", // AR session (there is no MR session)
        },
        optionalFeatures: true // To add more features like hit testing
    });

    // Set a free camera which moves with the user
    const camera = new BABYLON.FreeCamera("Camera", new BABYLON.Vector3(0, 1, 0), scene);

    camera.setTarget(new BABYLON.Vector3(0, 0, 3)); // Set initial looking point
    camera.attachControl(canvas, true); // Gives control of canvas to the camera

    const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(1, 1, 0));
    
    // renderFunc.locateAssets(scene);

    // Functions that will be rendered every cycle
    scene.registerBeforeRender(function () {
        renderFunc.detectObject(scene); // Put information for a detected element
        renderFunc.videoPausePlay(scene); // If video, play and pause it depending on were user looks
        renderFunc.detectCommand(scene); // Do something for a detected command
    });

    return scene;
};

let sceneToRender = await createScene();
engine.runRenderLoop(() => sceneToRender.render()); // Render the scene in a loop
