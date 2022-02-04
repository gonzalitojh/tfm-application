import { distance } from '../utils/constants.js';
import { side, calculatePosition, createAudio, createImage, createModel, createText, createVideo } from './assetsFunctions.js';
import { video_channel, detectedObjs, recognizedCommands } from '../webrtc/sender.js';
import * as _assets from '../utils/assets.json' assert { type: "json" };
import * as _detectedObjects from '../utils/detectedObjects.json' assert { type: "json" };
import * as _detectedCommands from '../utils/detectedCommands.json' assert { type: "json" };
import * as _tutorials from '../utils/tutorials.json' assert { type: "json" };

const assets = _assets.default;
const detectedObjects = _detectedObjects.default;
const detectedCommands = _detectedCommands.default;
const tutorials = _tutorials.default;

var videos = {}; // Dict to store videos
var images = {}; // Dict to store images
var audios = {}; // Dict to store audios
var texts = {};  // Dict to store texts
var models = {}; // Dict to store texts

const minDiff = 0.5; // Minimum distance to stop a video when not looking at it 

var voice_paused = false; // Store when video has been stopped by voice commands

var appliedCommands = 0; // Count of detected commands to not act over same order

var detect = false;
var making_tutorial = false;
const modulesDetected = new Set();

const chooseSide = function(poseSide) {
    let _side;
    switch (poseSide) {
        case "left":
            _side = side.LEFT;
            break;
        case "center":
            _side = side.CENTER;
            break;
        case "right":
            _side = side.RIGHT;
            break;
    }
    return _side;
}

// Creates and locates an element in the world
const createElement = function(scene, type, asset) {
    if (asset.pose && asset.pose.type == "relative") { // If pose is relative, it must be calculated
        let _side = chooseSide(asset.pose.side);
        let angle = (asset.pose.angle) ? asset.pose.angle * (Math.PI/180) : undefined;
        var pose = calculatePosition(scene, asset.pose.distance, _side, angle);
        if (asset.pose.rotation)
            pose.rotation = new BABYLON.Vector3(asset.pose.rotation[0], asset.pose.rotation[1], asset.pose.rotation[2]);
    } else if (asset.pose && asset.pose.type == "absolute") { // If pose is absolute it just needs to be assigned
        let scale = (asset.pose.scale) ? new BABYLON.Vector3(asset.pose.scale[0], asset.pose.scale[1], asset.pose.scale[2]) : undefined;
        let pos = (asset.pose.position) ? new BABYLON.Vector3(asset.pose.position[0], asset.pose.position[1], asset.pose.position[2]) : undefined;
        let rot = (asset.pose.rotation) ? new BABYLON.Vector3(asset.pose.rotation[0], asset.pose.rotation[1], asset.pose.rotation[2]) : undefined;
        var pose = {
            scale: scale,
            position: pos,
            rotation: rot
        };
    }

    switch (type) {
        case "videos": // Create a video
            videos[asset.name] = createVideo(scene, asset.name, asset.path, pose.position, pose.rotation, pose.direction);
            break;
        case "images": // Create an image
            images[asset.name] = createImage(scene, asset.name, asset.path, pose.position, pose.rotation, pose.direction);
            break;
        case "audios": // Create an audio
            audios[asset.name] = createAudio(scene, asset.name, asset.path);
            break;
        case "models": // Create a model
            if (!(asset.name in models))
                models[asset.name] = createModel(scene, asset.folder, asset.file, pose.scale, pose.position, pose.rotation);
            break;
        case "texts": // Create a text
            texts[asset.name] = createText(scene, asset.name, asset.text, pose.position, pose.rotation, pose.direction);
            break;
    }
}

// Iterates over assets to create them
export const locateAssets = function (scene, condition = null) {
    for (let type in assets) { // Takes every asset type
        for (let asset of assets[type]) { // Takes every asset of a specific type
            if (asset.condition == condition) // If condition, asset is located somewhere else
                createElement(scene, type, asset);
        }
    }
}

// Act when an object has been detected accordingly to what has been defined
export const detectObject = function(scene) {
    if (!making_tutorial) {
        if (detect) {
            if (detectedObjs.length > 0) {
                let obj = detectedObjs[0];

                if (!modulesDetected.has(obj)) {
                    modulesDetected.add(obj);
                }
                detectedObjs.shift();
            }
        } else {
            if (detectedObjs.length > 0) {
                let obj = detectedObjs[0];
                for (let object of detectedObjects) {
                    if (object.name == obj) {
                        locateAssets(scene, object.id);
                        break;
                    }
                }
                detectedObjs.shift();
            }
        }
    }
};

// When not looking to video it stops and when looking it plays
export const videoPausePlay = function(scene) {
    for (var key in videos) { // Take every video in dict
        if (!videos[key].direction) // If video has no direction, passed
            continue;

        let video = videos[key].video;
        let direction = videos[key].direction;

        let ray = scene.activeCamera.getForwardRay(2); // Ray from the center of the device (user)
        // Calculates distance from video center to looking point (ray)
        let diff = new BABYLON.Vector3(Math.abs(ray.direction.x - direction.x), Math.abs(ray.direction.y - direction.y), Math.abs(ray.direction.z - direction.z));
        // If distance to high in any axis, video y been played and it is not paused by voice, stop it
        if ((diff.x > minDiff || diff.y > minDiff || diff.z > minDiff) && !video.paused && !voice_paused) {
            video.pause();
        // If distance is low for all axis and video is paused but not with voice, play it
        } else if (diff.x < minDiff && diff.y < minDiff && diff.z < minDiff && video.paused && !voice_paused) {
            video.play();
        }
    }
}

const checkModules = function(scene) {
    console.log("Modules detected")
    console.log(modulesDetected);
    for (let tutorial of tutorials) {
        let all = true;
        for (let material of tutorial.materials) {
            if (!modulesDetected.has(material)) {
                all = false;
                break;
            }
        }
        if (all) {
            locateAssets(scene, "choosing " + tutorial.name);
        }
    }
    locateAssets(scene, "choosing tutorial");
    modulesDetected.clear()
}

const hideAll = function(scene) {
    for (let video in videos) {
        if (videos[video].object) {
            videos[video].video.pause();
            videos[video].object.dispose();
        }
    }
    videos = {};
    for (let image in images) {
        if (images[image].object)
            images[image].object.dispose();
    }
    images = {};
    for (let audio in audios) {
        audios[audio].pause();
        audios[audio].dispose();
    }
    audios = {};
    for (let text in texts) {
        if (texts[text].object)
            texts[text].object.dispose();
    }
    texts = {};
    for (let i = 3; i < scene.meshes.length; i++) {
        scene.meshes[i].dispose();
    }
    models = {};
}

const performAction = function(scene, action, asset = undefined) {
    switch (action) {
        case "PlayVideo":
            if (asset && videos[asset] && videos[asset].video.paused) {
                voice_paused = false;
                videos[asset].video.play();
            }
            break;
        case "StopVideo":
            if (asset && videos[asset] && !videos[asset].video.paused) {
                voice_paused = true; // If stopped by voice, only played again by voice
                videos[asset].video.pause();
            }
            break;
        case "StartDetect":
            console.log("start detection");
            hideAll(scene);
            detect = true;
            if(video_channel.readyState == "open")
                video_channel.send("start detection");
            break;
        case "StopDetect":
            console.log("stop detection");
            detect = false;
            making_tutorial = true;
            if(video_channel.readyState == "open")
                video_channel.send("stop detection");
            checkModules(scene);
            break;
        case "Hide":
            hideAll(scene);
            break;
        case "EndTutorial":
            hideAll(scene);
            making_tutorial = false;
            break;
    }
}

// Act when a command has been recognized accordingly to what has been defined
export const detectCommand = function(scene) {
    if (recognizedCommands.length > appliedCommands) {
        let com = recognizedCommands[appliedCommands];
        appliedCommands++; // Increment detected commands to not act over the same

        let newCom = com;
        let assetApplied;
        searchingAsset: // Label name
            for (let type in assets) { // Takes every asset type
                for (let asset of assets[type]) { // Takes every asset of a specific type
                    if (com.search(asset.name)) { // If condition, asset is located somewhere else
                        assetApplied = asset.name;
                        newCom = com.replace(asset.name, "");
                        newCom = newCom.trim();
                        break searchingAsset; // Break both loops
                    }
                }
            }

        for (let tutorial of tutorials) {
            if (com == tutorial.name) {
                hideAll(scene);
                locateAssets(scene, tutorial.name);
                break;
            }
        }

        for (let action of detectedCommands) {
            if (action.commands.includes(newCom)) {
                performAction(scene, action.action, assetApplied);
            }
        }
    }
}