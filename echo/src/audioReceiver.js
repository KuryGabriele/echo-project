let audioSources = [];
let audioContexts = [];
let clientBuffers = [];
let clientIds = []

export async function startOutputAudioStream(clientId) {
    if(!clientIds.includes(clientId)){
        console.log("Negri")
        var context = new AudioContext();
        const scriptNode = audioContext.createScriptProcessor(4096, 2, 2);
        scriptNode.connect(audioContext.destination);

        scriptNode.onaudioprocess = function (e) {
            var outputBuffer = e.outputBuffer;
            var index = clientIds.index(clientId);

            if(clientBuffers[index]){
                var leftOutput = outputBuffer.getChannelData(0);
                var rightOutput = outputBuffer.getChannelData(1);
    
                var leftReceived = clientBuffers[index].getChannelData(0);
                var rightReceived = clientBuffers[index].getChannelData(1);
    
                leftOutput.set(leftReceived);
                rightOutput.set(rightReceived);
    
                outputBuffer = null;
            } else {
                // If there is no received audio data, fill the output buffer with silence
                var leftOutput = outputBuffer.getChannelData(0);
                var rightOutput = outputBuffer.getChannelData(1);
                for (var i = 0; i < outputBuffer.length; i++) {
                  leftOutput[i] = 0;
                  rightOutput[i] = 0;
                }
            }
        };

        audioSources.push(sourceNode);
        clientIds.push(clientId);
        audioContexts.push(context);

        sourceNode.connect(context.destination);
        sourceNode.start(0);
    }
}

export async function addToBuffer(clientId, left, right) {
    if(clientIds.includes(clientId)){
        let index = clientIds.indexOf(clientId);
        var audioBuffer = audioContexts[index].createBuffer(2, 4096, 48000);
        
        audioBuffer.copyToChannel(left, 0);
        audioBuffer.copyToChannel(left, 1);

        clientBuffers[index] = audioBuffer;
    }
}