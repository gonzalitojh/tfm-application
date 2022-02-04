from __future__ import division
from ObjectDetector.models import *
from ObjectDetector.utils.utils import *
from ObjectDetector.utils.datasets import *
import cv2
import torch
from torch.autograd import Variable
import numpy as np

from av import VideoFrame
from aiortc import MediaStreamTrack

image_folder        = "ObjectDetector/data/samples"                  # path to dataset
model_def           = "ObjectDetector/config/yolov3-custom.cfg"      # path to model definition file
weights_path        = "ObjectDetector/weights/yolov3_ckpt_499.pth"   # path to weights file
class_path          = "ObjectDetector/data/custom/classes.names"     # path to class label file
conf_thres          = 0.95                                           # object confidence threshold
nms_thres           = 0.4                                            # iou thresshold for non-maximum suppression
batch_size          = 1                                              # size of the batches
n_cpu               = 0                                              # number of cpu threads to use during batch generation
img_size            = 416                                            # size of each image dimension
checkpoint_model    = "ObjectDetector/weights/yolov3_ckpt_499.pth"   # path to checkpoint model

def Convert_RGB(img):
    # Convert Blue, green, red into Red, green, blue
    b = img[:, :, 0].copy()
    g = img[:, :, 1].copy()
    r = img[:, :, 2].copy()
    img[:, :, 0] = r
    img[:, :, 1] = g
    img[:, :, 2] = b
    return img

def Convert_BGR(img):
    # Convert red, blue, green into Blue, green, red
    r = img[:, :, 0].copy()
    g = img[:, :, 1].copy()
    b = img[:, :, 2].copy()
    img[:, :, 0] = b
    img[:, :, 1] = g
    img[:, :, 2] = r
    return img

class DetectionVideo(MediaStreamTrack):

    kind = "video"
    
    def __init__(self, track, peer_conn):
        super().__init__()  # Important
        self.track = track
        self.peer_conn = peer_conn

        # Choose device for training: cuda if it is available, cpu if not
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print("cuda" if torch.cuda.is_available() else "cpu")
        self.model = Darknet(model_def, img_size=img_size).to(device) # Create model

        # Upload weights of model
        if weights_path.endswith(".weights"):
            self.model.load_darknet_weights(weights_path)
        else:
            self.model.load_state_dict(torch.load(weights_path))

        self.model.eval() # Evaluate model
        self.classes = load_classes(class_path) # Upload classes to detect
        self.Tensor = torch.cuda.FloatTensor if torch.cuda.is_available() else torch.FloatTensor

        self.detect = False
        self.objs = set()

        self.single_detection = {
            "object": None,
            "num": 0
        }
        # self.colors = np.random.randint(0, 255, size=(len(self.classes), 3), dtype="uint8")

        # Receives video datachannel
        @peer_conn.on("datachannel")
        def on_datachannel(channel):
            if channel.label == "video_channel": # Filter to get only video
                self.data_channel = channel
                @channel.on("message")
                def on_message(message): # On received message, print it
                    print(message)
                    if message == "start detection":
                        self.detect = True
                    elif message == "stop detection":
                        self.detect = False

    def add_to_set(self, x):
        # Return True if added to set and False if not
        return len(self.objs) != (self.objs.add(x) or len(self.objs))

    # Object detector program
    async def recv(self):
        frame = await self.track.recv()
        res = (720,540)
        
        frame = frame.to_ndarray(format="bgr24")
        
        frame = cv2.resize(frame, res, interpolation=cv2.INTER_CUBIC)

        # The image is BGR and it has to be converted into RGB
        RGBimg = Convert_RGB(frame)
        imgTensor = transforms.ToTensor()(RGBimg)
        imgTensor, _ = pad_to_square(imgTensor, 0)
        imgTensor = resize(imgTensor, 416)
        imgTensor = imgTensor.unsqueeze(0)
        imgTensor = Variable(imgTensor.type(self.Tensor))

        # Obtain detections
        with torch.no_grad():
            detections = self.model(imgTensor)
            detections = non_max_suppression(detections, conf_thres, nms_thres)

        # For each detection, coordinates are taken and object is marked with a rectangle.
        for detection in detections:
            if detection is not None:
                detection = rescale_boxes(detection, img_size, RGBimg.shape[:2])
                for x1, y1, x2, y2, conf, cls_conf, cls_pred in detection:
                    if self.detect and self.data_channel is not None:
                        if self.add_to_set(self.classes[int(cls_pred)]):
                            self.data_channel.send(self.classes[int(cls_pred)])
                    elif detection.size(dim=0) == 1:
                        if self.single_detection["object"] == self.classes[int(cls_pred)]:
                            self.single_detection["num"] += 1
                        else:
                            self.single_detection["object"] = self.classes[int(cls_pred)]
                            self.single_detection["num"] = 1
                    else:
                        self.single_detection["object"] = None
                        self.single_detection["num"] = 0
                    
                    if self.single_detection["num"] == 30 and self.data_channel is not None:
                        self.data_channel.send(self.classes[int(cls_pred)])
                        print("{} was detected in X1: {}, Y1: {}, X2: {}, Y2: {}, with a certainty of {}.".format(self.classes[int(cls_pred)], x1, y1, x2, y2, conf))

                #     box_w = x2 - x1
                #     box_h = y2 - y1
                #     color = [int(c) for c in self.colors[int(cls_pred)]]
                #     print("{} was detected in X1: {}, Y1: {}, X2: {}, Y2: {}, with a certainty of {}.".format(self.classes[int(cls_pred)], x1, y1, x2, y2, conf))
                #     frame = cv2.rectangle(frame, (x1, y1 + box_h), (x2, y1), color, 5)
                #     cv2.putText(frame, self.classes[int(cls_pred)], (x1, y1), cv2.FONT_HERSHEY_SIMPLEX, 1, color, 2)# Nombre de la clase detectada
                #     cv2.putText(frame, str("%.2f" % float(conf)), (x2, y2 - box_h), cv2.FONT_HERSHEY_SIMPLEX, 0.5,color, 2) # Certeza de prediccion de la clase
                
                # cv2.imshow('frame', Convert_BGR(RGBimg))
                # if cv2.waitKey(25) & 0xFF == ord('q'):
                #     break
