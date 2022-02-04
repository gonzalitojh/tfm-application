import { distance } from '../utils/constants.js';

// Enumerate to choose side to place an object from a point
export const side = {
    LEFT: "left",
    CENTER: "center",
    RIGHT: "right"
}

const SIDE_ANGLE = Math.PI / 12; // 15º by default

// Calculate a position in the scene. Calculate also a position near a point.
export const calculatePosition = function (scene, _distance = distance, _side = side.CENTER, side_angle = SIDE_ANGLE) {
    let ray = scene.activeCamera.getForwardRay(_distance); // Get ray from camera
    let direction = ray.direction;
    let angle = Math.abs(Math.atan(direction.z / direction.x)); // Get angle of the direction

    // If object is centered it is not necessary to change direction
    if (_side != side.CENTER) {
        let new_angle, _x, _z;
        let _y = direction.y;

        // If not centered, on the left by default
        if (_side == side.RIGHT)
            side_angle = - side_angle;

        let hemisphere = 0;
        if (direction.x < 0) // If quadrant 3 or 4 (southern hemiphere) adds PI
            hemisphere = Math.PI;

        if (direction.x * direction.z >= 0) { // Quadrant 1 or 3
            new_angle = hemisphere + angle + side_angle; // Calculate new angle of direction
            _x = Math.cos(new_angle);
            _z = Math.sin(new_angle);
        } else { // Quadrant 2 or 4
            new_angle = hemisphere + Math.PI / 2 + angle - side_angle; // Calculate new angle of direction
            _x = Math.sin(new_angle);
            _z = Math.cos(new_angle);
        }

        direction = new BABYLON.Vector3(_x, _y, _z);
    }
    // Calculate position of object taking into account the direction of it
    let position = new BABYLON.Vector3(ray.origin.x + direction.x * _distance, ray.origin.y + direction.y * _distance, ray.origin.z + direction.z * _distance);
    return {
        position,
        direction
    }
}

// Import an audio and reproduce it
export const createAudio = function (scene, name, file) {
    var music = new BABYLON.Sound(name, file, scene, function () {
        // Sound has been downloaded and decoded
        console.log("Loaded audio");
        setTimeout(() => { // Waits 1 second to play audio
            music.play();
        }, 1000);
    });

    return music;
}

// Import an image and reproduce it
export const createImage = function (scene, name, file,
    position = new BABYLON.Vector3(0, 0, 0),
    rotation = new BABYLON.Vector3(0, 0, 0),
    direction = undefined) {
    var planeOpts = {
        height: 0.15,
        width: 0.25,
        sideOrientation: BABYLON.Mesh.DOUBLESIDE // Image can be watched from front and back
    };

    // Create a plane to host image
    var plane = BABYLON.MeshBuilder.CreatePlane(name, planeOpts, scene);
    plane.position = position; // Sets position and direction or rotation of image
    if (direction)
        plane.setDirection(direction);
    else
        plane.rotation = rotation;

    var material = new BABYLON.StandardMaterial("m", scene);

    // Gets file and insert on texture
    var texture = new BABYLON.Texture(file, scene);
    material.diffuseTexture = texture; // Adds image to material
    material.specularColor = new BABYLON.Color3(0, 0, 0);
    plane.material = material; // Assign material to plane

    return {
        object: plane,
        position: position,
        rotation: rotation,
        direction: direction
    };
}


// Import a model in the scene
export const createModel = function (scene, folder, file,
    scale = new BABYLON.Vector3(1, 1, 1),
    position = new BABYLON.Vector3(0, 0, 0),
    rotation = new BABYLON.Vector3(0, 0, 0)) {
    BABYLON.OBJFileLoader.OPTIMIZE_WITH_UV = true;
    let obj;
    BABYLON.SceneLoader.ImportMesh(
        undefined,
        folder,
        file,
        scene,
        function (object) {
            console.log('Model Loaded');
            obj = object;
            // Apply properties to object
            object[0].scaling = scale;
            object[0].position = position;
            object[0].rotation = rotation;
        }
    );

    return {
        object: obj,
        scale: scale,
        position: position,
        rotation: rotation
    };
}

// Create a text inside a box that can be scrolled
export const createText = function (scene, name, text,
    position = new BABYLON.Vector3(0, 0, 0),
    rotation = new BABYLON.Vector3(0, 0, 0),
    direction = undefined) {
    var planeOpts = {
        height: 0.3,
        width: 0.5
    };
    var plane = BABYLON.MeshBuilder.CreatePlane(name, planeOpts, scene);
    plane.position = position; // Sets position and direction of text
    if (direction)
        plane.setDirection(direction);
    else
        plane.rotation = rotation;
    
    var texture = new BABYLON.GUI.AdvancedDynamicTexture.CreateForMesh(plane);

    // Create a text block and some configurations
    var textBlock = new BABYLON.GUI.TextBlock();
    textBlock.textWrapping = true;
    textBlock.height = 0.3;
    textBlock.width = 0.5;
    textBlock.paddingTop = "1%";
    textBlock.paddingLeft = "1px";
    textBlock.paddingRight = "1px"
    textBlock.paddingBottom = "1%";
    textBlock.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    textBlock.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    textBlock.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    textBlock.textVerticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    textBlock.color = "white";

    textBlock.text = text; // Assign text to text block

    textBlock.fontSize = "20px";

    texture.addControl(textBlock); // Include text block inside the plane's texture

    return {
        object: plane,
        position: position,
        rotation: rotation,
        direction: direction
    };
}

// Import a video and reproduce it
export const createVideo = function (scene, name, file,
    position = new BABYLON.Vector3(0, 0, 0),
    rotation = new BABYLON.Vector3(0, 0, 0),
    direction = undefined) {
    var planeOpts = {
        height: 0.3,
        width: 0.5,
        sideOrientation: BABYLON.Mesh.DOUBLESIDE // Video can be watched from front and back
    };
    // Create a plane to host video
    var plane = BABYLON.MeshBuilder.CreatePlane(name, planeOpts, scene);
    plane.position = position; // Sets position and direction of video
    if (direction)
        plane.setDirection(direction);
    else
        plane.rotation = rotation;
        
    var material = new BABYLON.StandardMaterial("m", scene);
    var videoOpts = {
        loop: false, // Do not reproduce constantly
        autoUpdateTexture: true
    };
    // Gets file and insert on texture
    var texture = new BABYLON.VideoTexture("vidtex", file, scene, true, false, BABYLON.VideoTexture.TRILINEAR_SAMPLINGMODE, videoOpts);
    material.diffuseTexture = texture; // Adds video to material
    material.roughness = 1; // Blurness of reflections
    material.emissiveColor = new BABYLON.Color3.White(); // White color in case there is no video
    plane.material = material; // Assign material to plane

    let video = texture.video;

    setTimeout(() => { // Waits 1 second to play video
        video.play();
    }, 1000);

    return {
        object: plane,
        video: video,
        position: position,
        rotation: rotation,
        direction: direction
    };
}
