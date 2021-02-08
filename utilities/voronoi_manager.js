
function getCellPoints(cell, pointsBuffer, returnValue=false){
    var vertices;
    if(returnValue) vertices = [];
    for (var j = 0; j < cell.halfedges.length; j++) {
        if(returnValue)vertices.push([cell.halfedges[j].getStartpoint().x, cell.halfedges[j].getStartpoint().y]);
        pointsBuffer[j*2] = cell.halfedges[j].getStartpoint().x;
        pointsBuffer[j*2+1] = cell.halfedges[j].getStartpoint().y;

    }
    if(returnValue) return vertices
}

export {
    getCellPoints
}