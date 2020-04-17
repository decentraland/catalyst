const urlParams = new URLSearchParams(location.search);

const testId = urlParams.get("testId");

const resultsServerUrl = urlParams.get("resultsServerUrl") ?? "http://ec2-3-227-255-51.compute-1.amazonaws.com:9904";

if (!testId) {
  alert("Please provide a test id in the url of the program: ?testId=...");
} else {
  (async function(){
    const testResponse = await fetch(`${resultsServerUrl}/test/${testId}?dataPoints=true`)
    if(testResponse.status >= 400) {
      const text = await testResponse.text();
      throw new Error(`Unexpected response from server (${testResponse.status}): ${text}`)
    }

    window.testJson = await testResponse.json();
  })().catch(e => console.log("Error fetching test!", e))
}

function timeSlice(minStamp, maxStamp, dataPoints = testJson.dataPoints) {
  return dataPoints.filter(it => it.timestamp > minStamp && it.timestamp < maxStamp)
}

function dataPointsFor(peerId, dataPoints = testJson.dataPoints) {
  return testJson.dataPoints.filter(it => it.peerId === peerId);
}

function metric(metric, dataPoints = testJson.dataPoints) {
  return dataPoints.map(it => it.metrics[metric])
}

function average(numbers) {
  return numbers.reduce((a, b) => a + b, 0) / numbers.length;
}

