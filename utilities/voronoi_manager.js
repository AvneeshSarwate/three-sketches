
function getCellPoints(cell, pointsBuffer){
    var vertices = [];
    for (var j = 0; j < cell.halfedges.length; j++) {
        vertices.push([cell.halfedges[j].getStartpoint().x, cell.halfedges[j].getStartpoint().y]);
    }
    return vertices
}

export {
    getCellPoints
}