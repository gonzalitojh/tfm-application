import { distance } from '../utils/constants.js';
import { side, calculatePosition, createAudio, createModel, createText, createVideo } from './assetsFunctions.js';
import { detectedObjs, recognizedCommands } from '../webrtc/sender.js';
import * as _assets from '../utils/assets.json' assert { type: "json" };
import * as _detectedObjects from '../utils/detectedObjects.json' assert { type: "json" };
import * as _detectedCommands from '../utils/detectedCommands.json' assert { type: "json" };

const assets = _assets.default;
const detectedObjects = _detectedObjects.default;
const detectedCommands = _detectedCommands.default;

var locatedObjs = 0; // Count of detected objects to not act over same element

var videos = {}; // Dict to store videos
var images = {}; // Dict to store images
var audios = {}; // Dict to store audios
var texts = {}; // Dict to store texts

const minDiff = 0.5; // Minimum distance to stop a video when not looking at it 

var voice_paused = false; // Store when video has been stopped by voice commands

var appliedCommands = 0; // Count of detected commands to not act over same order

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
        var pose = calculatePosition(scene, asset.pose.distance, _side, asset.pose.angle);
    } else if (asset.pose && asset.pose.type == "absolute") { // If pose is absolute it just needs to be assigned
        let pos = (asset.pose.position) ? new BABYLON.Vector3(asset.pose.position[0], asset.pose.position[1], asset.pose.position[2]) : undefined;
        let rot = (asset.pose.rotation) ? new BABYLON.Vector3(asset.pose.rotation[0], asset.pose.rotation[1], asset.pose.rotation[2]) : undefined;
        var pose = {
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
            createModel(scene, asset.folder, asset.file, asset.scale, asset.position, asset.rotation);
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
    if (detectedObjs.length > locatedObjs) {
        let obj = detectedObjs[locatedObjs];
        locatedObjs++; // Increment located objects to not act over the same

        for (let object of detectedObjects) {
            if (object.name == obj) {
                locateAssets(scene, object.id);
                break;
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

const performAction = function(action, asset = undefined) {
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
    }
}

// Act when a command has been recognized accordingly to what has been defined
export const detectCommand = function() {
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

        for (let action of detectedCommands) {
            if (action.commands.includes(newCom)) {
                performAction(action.action, assetApplied);
            }
        }
    }
}