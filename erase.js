/*
 *  Filename: erase.js
 *  An eraser function designed for use with Standard Vector Graphics.
 *  Author: David Brokaw, with Erik Weitnauer and David Landy
 *  Created: Spring 2014
 *  Last Modified On: 2018/01/23
 *  Last Modified By: Michael Plunkett
 */

/**
  The function gets an array of paths and an erasePath. It returns a new
  array of paths that are the result of removing everything in the eraser path
  from the paths.

  Each individual path in paths is represented as an object of points and descriptors, with each point being
  an {"SOME_PROPERTY": VALUE, "coords": [{x: VALUE, y: VALUE}]} array. "{"stroke":"#000000","coords":[{"x":0,"y":0}, {"x":100,"y":100}]}" 
  is an example of a path consisting of a single
  line segment from the origin to (100,100). "{"stroke":"#000000","coords":[{"x":20,"y":10}}" would also be a valid path,
  consisting of a single point at the position (20,10).

  Each individual path is represented as an array of points, with each point being
  an {x: VALUE, y: VALUE} array. `[{x: 0, y: 0}, {x: 100, y: 100}` is an example of a path consisting of a single
  line segment from the origin to (100,100). `[{x: 20, y: 10}]` would also be a valid path,
  consisting of a single point at the position (20,10).

  The eraseRadius is the radius of the imagined circular eraser moved over the canvas.
  It's the same as half of the stroke width. We will assume for now that the stroke width
  / radius of the actual paths that are to be erased is zero.

  NOTE: You cannot include circular references (think DOM refrences that reference themselves at some point)
  inside your paths as they are not compatible with the JSON.stringify method. I would suggest going through 
  the paths you are submitting first and doing the 'delete path[index].circularProperty' function.
*/

// This line is for the automated tests with node.js
if (typeof(exports) !== 'undefined') exports.erase = erase;

function erase(paths, erasePath, eraseRadius) {
  //var date = new Date();
  //var time1 = date.getMilliseconds();
  eraseRadius = eraseRadius || 20;

  /*
  * To get test case: uncomment this block and the block immediately before the return statement.
  *
  console.log("erase radius: " + eraseRadius);
  console.log("erase path:");
  logPath(erasePath, 1);
  console.log("paths:");
  logPaths(paths);
  */

  var newPaths = [];

  // pointErase is for use when erasePath is of length 1.  In this case the erasing element is a circle, not a capsule.
  var pointErase = function(path) {
    var eX = erasePath[0].x,
      eY = erasePath[0].y,
      i = 0,
      last = 0,
      x;

    // handle point path
    if (path.coords.length === 1) {
      if (!withinCircle(path.coords[0].x, path.coords[0].y, eX, eY, eraseRadius)) {
        newPaths.push(path);
        return;
      }
    }

    var newPath = createNewPath(path);
    newPath.coords.clear();
    while (i < path.coords.length - 1) {
      var p0 = path.coords[i],
        p1 = path.coords[i + 1],
        p0_withinCircle = withinCircle(p0.x, p0.y, eX, eY, eraseRadius),
        p1_withinCircle = withinCircle(p1.x, p1.y, eX, eY, eraseRadius);

      // if both points are in the erase area, the first point does not contribute to a new path and can be ignored
      if (p0_withinCircle && p1_withinCircle) last = ++i;

      // If p0 is in the erase area and p1 is not, the first point can be replaced by the point of intersection
      //   between the segment p0->p1 and the border of the erase area. Erasing can continue from there as if the intersection 
      //   was the first point in the path.
      else if (p0_withinCircle && !p1_withinCircle) {
        x = getCircleIntersection(p0.x, p0.y, p1.x, p1.y, eX, eY, eraseRadius);
        if (x) {
          path.coords[i] = x;
          last = i;
        } else i++;
      }

      // If p0 is outside the erase area, and p1 is inside, then all points before and including p0 and the point of intersection
      //   contribute to a new path.  Processing then continues at p1.
      else if (!p0_withinCircle && p1_withinCircle) {
        x = getCircleIntersection(p1.x, p1.y, p0.x, p0.y, eX, eY, eraseRadius);
        if (x) {
          newPath.coords = path.coords.slice(last, i + 1);
          newPath.coords.push(x);
          newPaths.push(createNewPath(newPath));
        }
        last = ++i;
      } else {
        // Neither p0 or p1 is in the erase area, so there may or may not be a pair of intersections.
        var possIntersects = getCircleIntersections(p0.x, p0.y, p1.x, p1.y, eX, eY, eraseRadius);
        if (possIntersects) {
          // create a new path that goes from the beginning of our current path
          // to the intersection point
          newPath.coords = path.coords.slice(last, i + 1);

          // only add the intersection point if it is not identical to the last
          // point in the path
          if (newPath.coords[newPath.coords.length - 1].x !== possIntersects[0].x ||
            newPath.coords[newPath.coords.length - 1].y !== possIntersects[0].y) newPath.coords.push(possIntersects[0]);

          // we only want paths with length > 1
          if (newPath.coords.length > 1) newPaths.push(createNewPath(newPath));

          // we will put the second intersection point into the current position
          // of our path, but only if it is not identical to the next point in
          // the path (we don't need duplicate points)
          path.coords[i] = possIntersects[1];
          if (path.coords[i + 1] && path.coords[i + 1].x === possIntersects[1].x && path.coords[i + 1].y === possIntersects[1].y) i++;
          last = i;
        } else i++;
      }
    }
    // the remaining points are assembled into a new path
    if (last !== i) {
      newPath.coords = path.coords.slice(last, path.coords.length);
      if (newPath.coords.length > 0) newPaths.push(newPath);
    }
  }; // end pointErase

  // If the erasePath has a length greater than one, then each successive pair of coordinate pairs can be used to form a capsule-
  //   shape along with the eraseRadius.  Each capsule in the erasePath can act independently of each other.
  var capsuleErase = function(path, eraseIndex) {
    var e0 = erasePath[eraseIndex],
      e1 = erasePath[eraseIndex + 1],
      i = 0,
      last = 0,
      p0_locationIndex,
      x;

    // handle point path
    if (path.coords.length === 1) {
      p0_locationIndex = withinCapsule(path.coords[0].x, path.coords[0].y, e0.x, e0.y, e1.x, e1.y, eraseRadius);
      if (p0_locationIndex.indexOf(1) === -1) {
        newPaths.push(path);
        return;
      }
    }

    var newPath = createNewPath(path);
    newPath.coords.clear();
    while (i < path.coords.length - 1) {
      var p0 = path.coords[i],
        p1 = path.coords[i + 1],
        p1_locationIndex = withinCapsule(p1.x, p1.y, e0.x, e0.y, e1.x, e1.y, eraseRadius);
      p0_locationIndex = withinCapsule(p0.x, p0.y, e0.x, e0.y, e1.x, e1.y, eraseRadius);

      // if both points are in the erase area, the first point does not contribute to a new path and can be ignored
      if (p0_locationIndex.indexOf(1) !== -1 && p1_locationIndex.indexOf(1) !== -1) last = ++i;

      // If p0 is in the erase area and p1 is not, the first point can be replaced by the point of intersection
      //   between the segment p0->p1 and the border of the erase area. Erasing can continue from there as if the intersection 
      //   was the first point in the path.
      else if (p0_locationIndex.indexOf(1) !== -1 && p1_locationIndex.indexOf(1) === -1) {
        x = getCapsuleIntersection(p0.x, p0.y, p0_locationIndex, p1.x, p1.y, e0.x, e0.y, e1.x, e1.y, eraseRadius);
        if (x) {
          path.coords[i] = x;
          last = i;
        } else i++;
      }

      // If p0 is outside the erase area, and p1 is inside, then all points before and including p0 and the point of intersection
      //   contribute to a new path.  Processing then continues at p1.
      else if (p0_locationIndex.indexOf(1) === -1 && p1_locationIndex.indexOf(1) !== -1) {
        x = getCapsuleIntersection(p1.x, p1.y, p1_locationIndex, p0.x, p0.y, e0.x, e0.y, e1.x, e1.y, eraseRadius);
        if (x) {
          newPath.coords = path.coords.slice(last, i + 1);
          newPath.coords.push(x);
          newPaths.push(createNewPath(newPath));
          last = ++i;
        } else i++;
      } else {
        // Neither p0 or p1 is in the erase area, so there may or may not be a pair of intersections.
        var possIntersects = getCapsuleIntersections(p0.x, p0.y, p1.x, p1.y, e0.x, e0.y, e1.x, e1.y, eraseRadius);
        if (possIntersects) {
          // create a new path that goes from the beginning of our current path
          // to the intersection point
          newPath.coords = path.coords.slice(last, i + 1);

          // only add the intersection point if it is not identical to the last
          // point in the path
          if (newPath.coords[newPath.coords.length - 1].x !== possIntersects[0].x ||
            newPath.coords[newPath.coords.length - 1].y !== possIntersects[0].y) newPath.coords.push(possIntersects[0]);

          // we only want paths with length > 1
          if (newPath.coords.length > 1) newPaths.push(createNewPath(newPath));


          // we will put the second intersection point into the current position
          // of our path, but only if it is not identical to the next point in
          // the path (we don't need duplicate points)
          path.coords[i] = possIntersects[1];
          if (path.coords[i + 1] && path.coords[i + 1].x === possIntersects[1].x && path.coords[i + 1].y === possIntersects[1].y) i++;
          last = i;
        } else i++;
      }
    }
    // assemble the remaining points into a new path
    if (last !== i) {
      newPath.coords = path.coords.slice(last, path.coords.length);
      if (newPath.coords.length > 0) newPaths.push(createNewPath(newPath));
    }
  }; // end capsuleErase

  erasePath = cleanPath(erasePath);
  var p;
  if (erasePath.length === 1) {
    for (p = 0; p < paths.length; p++) pointErase(paths[p]);
    paths = newPaths;
  } else {
    for (var e = 0; e < erasePath.length - 1; e++) {
      for (p = 0; p < paths.length; p++) capsuleErase(paths[p], e);
      paths = newPaths;
      newPaths = [];
    }
  } // end main

  // round all coordinates
  // for (var r = 0; r < paths.length; r++) {
  //  for (var rr = 0; rr < paths[r].coords.length; rr++) {
  //    paths[r].coords[rr].x = Math.round(paths[r].coords[rr].x);
  //    paths[r].coords[rr].y = Math.round(paths[r].coords[rr].y);
  //  }
  // }

  /*
  * To get test case: uncomment this block and the block at the top of erase().
  *
  console.log("erase path (cleaned):");
  logPath(erasePath, 1);
  console.log("paths:");
  logPaths(paths);
  */
  //var time2 = date.getMilliseconds();
  //var deltaT = time2 - time1;
  //console.log(deltaT);


  return paths;
} // end erase

/* Helper functions:
 *  displayPath (path)
 *  displayPaths (paths)
 *  logPath (path, displaySwitch)
 *  logPaths (paths)
 *  cleanPath (path)
 *  getDistance (aX, aY, bX, bY)
 *  withinCircle (x, y, cX, cY, r)
 *  withinBox (pX, pY, aX, aY, bX, bY, r)
 *  withinCapsule (pX, pY, aX, aY, bX, bY, r)
 *  getParallelSegments (aX, aY, bX, bY, r)
 *  get_cirle_intersection (aX, aY, bX, bY, cX, cY, r)
 *  getCircleIntersections (aX, aY, bX, bY, cX, cY, r)
 *  getLineIntersection (aX, aY, bX, bY, cX, cY, dX, dY)
 *  getCapsuleIntersection (aX, aY, locationIndex, bX, bY, c0_x, c0_y, c1_x, c1_y, r)
 *  getCapsuleIntersections (aX, aY, bX, bY, c0_x, c0_y, c1_x, c1_y, r)
 */

// Note: for all intersection calculations, if a point is on the border of an object, 
//   for example at the distance from the center of a circle equal to the radius,
//   that point is considered to be outside that shape.

/*
 *  Takes a path, and will write it to a document.
 */
function displayPath(path) {
  document.write("[");
  for (var i = 0; i < path.length; i++) {
    document.write("[" + path[i].x + "," + path[i].y + "]");
    if (i === path.length - 1) document.write("]");
    else document.write(", ");
  }
}

/*
 *  Takes a list of paths, and will write them to a document with newlines between each.
 */
function displayPaths(paths) {
  document.write("<br/>Printing paths:<br/>");
  document.write("[");
  for (var i = 0; i < paths.length; i++) {
    displayPath(paths[i].coords);
    if (i !== paths.length - 1) document.write(",<br/>");
    else document.write("]");
  }
}

/*
 *  Takes a path, and writes it to the console or return it as a string.
 *  Takes a "display switch."  If 1, the path will be logged to the console.  If 0, the path will be returned as a string.
 */
function logPath(path, displaySwitch) {
  var log = "[";
  for (var i = 0; i < path.length; i++) {
    log += "[" + path[i].x + "," + path[i].y + "]";
    if (i !== path.length - 1) log += ",";
    else log += "]";
  }

  // log path to console
  if (displaySwitch) console.log(log);
  // return string for use elsewhere
  else return log;
}

/*
 *  Takes a list of paths, and will write them to the console.
 */
function logPaths(paths) {
  log = "[";
  for (var i = 0; i < paths.length; i++) {
    log += logPath(paths[i].coords, 0);
    if (i !== paths.length - 1) log += ",";
    else log += "]";
  }

  console.log(log);
}

/*
 *  Takes a path.
 *  cleanPath will remove all sequential, duplicate coordinate-pairs from the path.
 *  Returns a path.
 */
function cleanPath(path) {
  var cleaned = [];
  if (path.length === 1) cleaned = path;
  else {
    pClean = 0;
    while (pClean < (path.length - 1)) {
      if (path[pClean].x !== path[pClean + 1].x || path[pClean].y !== path[pClean + 1].y) cleaned.push(path[pClean]);
      pClean++;
    }
    if (path.length !== 0 && cleaned.length === 0) cleaned.push(path[0]);

    if (path[path.length - 1].x !== path[cleaned.length - 1].x || path[path.length - 1].y !== path[cleaned.length - 1].y) cleaned.push(path[pClean]);
  }
  return cleaned;
}

/*
 *  Takes the x and y coordinates of two points.  
 *  The distance between those two points is calculated.
 *  Returns a floating-point number.
 */
function getDistance(aX, aY, bX, bY) {
  return (Math.sqrt(Math.pow((bX - aX), 2) + Math.pow((bY - aY), 2)));
}

/*
 * Takes x, y: the coordinates of the point to be tested
 * Takes cX, cY: the coordinates of the center of the circle
 * Takes r: the radius of the circle located at (cX, cY)
 * Returns 0 or 1: 0 if the point is outside the circle, 1 if within
 */
function withinCircle(x, y, cX, cY, r) {
  var dist = getDistance(x, y, cX, cY);
  if (dist < r) return 1;
  else return 0;
}

/*
 * Takes pX, pY: the coordinates of the point to be tested
 * Takes aX, aY, bX, bY: the components of the points that define the line segment AB
 * Takes r: the "eraseRadius." This will be half the width of the box
 * Returns 0 or 1: 0 if the point is outside the box, 1 if within
 * Example: (1, 1, -5, 0, 5, 0, 5) => 1
 */
function withinBox(pX, pY, aX, aY, bX, bY, r) {
  // vectors
  var vec_ab = [(bX - aX), (bY - aY)],
    vec_ap = [(pX - aX), (pY - aY)];

  // tools for calculating projections
  var vec_n = [-vec_ab[1], vec_ab[0]],
    mag_n = Math.sqrt(Math.pow(vec_n[0], 2) + Math.pow(vec_n[1], 2)),
    u_vec_n = [vec_n[0] / mag_n, vec_n[1] / mag_n],
    mag_ab = Math.sqrt(Math.pow(vec_ab[0], 2) + Math.pow(vec_ab[1], 2)),
    u_vec_ab = [vec_ab[0] / mag_ab, vec_ab[1] / mag_ab];

  // use projections of AP to determine where P is in relation to the box 
  var ap_proj_ab = vec_ap[0] * u_vec_ab[0] + vec_ap[1] * u_vec_ab[1];
  if (ap_proj_ab <= 0 || ap_proj_ab >= mag_ab) return 0;

  var ap_proj_n = vec_ap[0] * u_vec_n[0] + vec_ap[1] * u_vec_n[1];
  if (ap_proj_n >= r || ap_proj_n <= -r) return 0;

  return 1;
}

/*
 * Takes pX, pY: the point in question
 * Takes aX, aY, bX, bY: the components of the points that define the line segment AB
 * Takes r: the "eraseRadius."  
 * A capsule is a shape that can be described as two line segments that run parallel to the line segment AB at distance eraseRadius,
 *   with a circle centered on each point A and B having radius eraseRadius.
 * 
 * Returns an array of length 3.  This array specifies where in the capsule the point may or may not be located.
 * 1 if it is within that area, 0 if not.
 * arr[0] => within the circle surrounding point a?
 * arr[1] => within the circle surrounding point b?
 * arr[2] => within the box, defined by the line segments parallel to the line segment AB?
 * 0, 1, or 2 of these values can be 1 simultaneously.
 * This array is referred to as the location index in other parts of this document.
 */
function withinCapsule(pX, pY, aX, aY, bX, bY, r) {
  var locationIndex = [];
  locationIndex.push(withinCircle(pX, pY, aX, aY, r));
  locationIndex.push(withinCircle(pX, pY, bX, bY, r));
  locationIndex.push(withinBox(pX, pY, aX, aY, bX, bY, r));
  return locationIndex;
}

/*
* Takes aX, aY, bX, bY: the coordinates of points A and B that define a line segment AB
* Takes r: the "eraseRadius"
* Returns an array of objects: the points that define a box around that line segment.  
* Length: the length of line segment AB, width: 2r.
*
* Example box:
  
  box[0]                  box[3]
  . _____________________ .
  |                       |
  |                       |
  A                       B
  |                       |
  |                       |
  .-----------------------.
  box[1]                  box[2]
   
   distance from box[0] to box[1] = distance from box[2] to box[3] = 2*r
   
*/
function getParallelSegments(aX, aY, bX, bY, r) {
  var vec_v = [(bX - aX), (bY - aY)],
    vec_n = [-vec_v[1], vec_v[0]],
    mag_n = Math.sqrt(Math.pow(vec_n[0], 2) + Math.pow(vec_n[1], 2)),
    u_vec_n = [vec_n[0] / mag_n, vec_n[1] / mag_n];

  var b0 = { x: (aX + r * u_vec_n[0]), y: (aY + r * u_vec_n[1]) },
    b1 = { x: (aX - r * u_vec_n[0]), y: (aY - r * u_vec_n[1]) },
    b2 = { x: (bX - r * u_vec_n[0]), y: (bY - r * u_vec_n[1]) },
    b3 = { x: (bX + r * u_vec_n[0]), y: (bY + r * u_vec_n[1]) };

  return [b0, b1, b2, b3];
}

/*
 * Use this function when it is known that one point is inside the circle and the other is out.
 * Takes aX, aY: the coordinates of the point inside the circle
 * Takes bX, bY: the coordinates of the point outside the circle
 * Takes cX, cY: the center point coordinates of the circle
 * Takes r: the radius of the circle
 * Returns an object: the x and y coordinates of the intersection between the line segment AB and the circle.
 */
function getCircleIntersection(aX, aY, bX, bY, cX, cY, r) {
  var vec_ac = [(cX - aX), (cY - aY)],
    vec_ab = [(bX - aX), (bY - aY)];

  var mag_ab = Math.sqrt(Math.pow(vec_ab[0], 2) + Math.pow(vec_ab[1], 2)),
    u_vec_ab = [(vec_ab[0] / mag_ab), (vec_ab[1] / mag_ab)],
    ac_proj_ab = vec_ac[0] * u_vec_ab[0] + vec_ac[1] * u_vec_ab[1];

  // rightPoint is the point on the line segment AB closest to C
  var rightPoint = [(aX + ac_proj_ab * u_vec_ab[0]), (aY + ac_proj_ab * u_vec_ab[1])],
    distCToRightPoint = Math.sqrt(Math.pow((cX - rightPoint[0]), 2) + Math.pow((cY - rightPoint[1]), 2)),
    b;
  if (distCToRightPoint === 0) b = r;
  else b = Math.sqrt(Math.pow(r, 2) - Math.pow(distCToRightPoint, 2));
  var intersection = {
    x: (aX + ac_proj_ab * u_vec_ab[0] + b * u_vec_ab[0]),
    y: (aY + ac_proj_ab * u_vec_ab[1] + b * u_vec_ab[1])
  };
  if (intersection.x === aX && intersection.y === aY) return null;
  return intersection;
}

/*
 * Use this function when it is known that both points A and B are outside the circle.
 * Takes aX, aY, bX, bY: the coordinates of the two points outside the circle, defining line segment AB.
 * Takes cX, cY: the coordinates of the center of the circle.
 * Takes r: the radius of the circle.
 * Returns either and array of two objects or null:
 *   An array if the line segment AB does intersect the circle at two points (single intersections are not allowed).
 *   Null if there were no intersections.
 */
function getCircleIntersections(aX, aY, bX, bY, cX, cY, r) {
  var vec_ac = [(cX - aX), (cY - aY)],
    vec_ab = [(bX - aX), (bY - aY)];

  var vec_n = [-vec_ab[1], vec_ab[0]],
    mag_n = Math.sqrt(Math.pow(vec_n[0], 2) + Math.pow(vec_n[1], 2)),
    u_vec_n = [vec_n[0] / mag_n, vec_n[1] / mag_n];

  // mag_d is the shortest distance from C to the line through AB
  var mag_d = vec_ac[0] * u_vec_n[0] + vec_ac[1] * u_vec_n[1];

  // although mag_d may be less than r, this does not exclusively guarantee that the line segment intersects 
  var closest = getClosestPointOnSegment([aX, aY], [bX, bY], [cX, cY]),
    dist = getLength([closest[0] - cX, closest[1] - cY]);
  if (dist >= r) return null;

  // x is the distance from the circumference of the circle to the point on the line segment AB closest to C
  // d is that closest point
  var x = Math.sqrt(Math.pow(r, 2) - Math.pow(mag_d, 2)),
    vec_cd = [(cX - mag_d * u_vec_n[0]), (cY - mag_d * u_vec_n[1])];

  var mag_ab = Math.sqrt(Math.pow(vec_ab[0], 2) + Math.pow(vec_ab[1], 2)),
    u_vec_ab = [(vec_ab[0] / mag_ab), (vec_ab[1] / mag_ab)];

  var intersections = [{
    x: (vec_cd[0] - u_vec_ab[0] * x),
    y: (vec_cd[1] - u_vec_ab[1] * x)
  }, {
    x: (vec_cd[0] + u_vec_ab[0] * x),
    y: (vec_cd[1] + u_vec_ab[1] * x)
  }];
  if (intersections[0].x === aX && intersections[0].y === aY) return null;
  return intersections;
}

/*
 * Takes the points that represent two line segments:
 *  A and B are line segment 1, C and D are line segment 2.
 * Returns null if the line segments do not intersect.
 * Returns the coordinate-pair of the intersection if it exists.
 */
function getLineIntersection(aX, aY, bX, bY, cX, cY, dX, dY) {
  var s1_x = bX - aX,
    s1_y = bY - aY,
    s2_x = dX - cX,
    s2_y = dY - cY;

  if ((-s2_x * s1_y + s1_x * s2_y) === 0) return null;
  var s = (-s1_y * (aX - cX) + s1_x * (aY - cY)) / (-s2_x * s1_y + s1_x * s2_y),
    t = (s2_x * (aY - cY) - s2_y * (aX - cX)) / (-s2_x * s1_y + s1_x * s2_y);

  if (s >= 0 && s <= 1 && t >= 0 && t <= 1) {
    // Collision detected
    var intX = aX + (t * s1_x),
      intY = aY + (t * s1_y);
    return { x: intX, y: intY };
  }
  return null; // No collision
}

/*
 * Use this when p0 is in the capsule and p1 isn't.  Pass in p0's location index.
 * Takes aX, aY, locationIndex: the coordinates of the point inside the capsule;  
 *   the location index specifies exactly where it is.
 * Takes bX, bY: the coordinates of the point outside the circle.
 * Takes c0_x, c0_y, c1_x, c1_y, r: the parameters that define the capsule: the line segment from c0 to c1 and the radius.
 * Returns an array containing the coordinates of the point of intersection between the line segment between A and B and the capsule
 */
function getCapsuleIntersection(aX, aY, locationIndex, bX, bY, c0_x, c0_y, c1_x, c1_y, r) {
  var box = getParallelSegments(c0_x, c0_y, c1_x, c1_y, r),
    intersections = [],
    i;

  if (locationIndex[0] && !locationIndex[1]) {
    intersections.push(getCircleIntersection(aX, aY, bX, bY, c0_x, c0_y, r));
    intersections.push(getLineIntersection(aX, aY, bX, bY, box[0].x, box[0].y, box[3].x, box[3].y));
    intersections.push(getLineIntersection(aX, aY, bX, bY, box[1].x, box[1].y, box[2].x, box[2].y));
    i = getCircleIntersections(aX, aY, bX, bY, c1_x, c1_y, r);
    if (i) intersections.push(i[0], i[1]);
  } else if (!locationIndex[0] && locationIndex[1]) {
    intersections.push(getCircleIntersection(aX, aY, bX, bY, c1_x, c1_y, r));
    intersections.push(getLineIntersection(aX, aY, bX, bY, box[0].x, box[0].y, box[3].x, box[3].y));
    intersections.push(getLineIntersection(aX, aY, bX, bY, box[1].x, box[1].y, box[2].x, box[2].y));
    i = getCircleIntersections(aX, aY, bX, bY, c0_x, c0_y, r);
    if (i) intersections.push(i[0], i[1]);
  } else if (locationIndex[0] && locationIndex[1]) {
    intersections.push(getCircleIntersection(aX, aY, bX, bY, c0_x, c0_y, r));
    intersections.push(getLineIntersection(aX, aY, bX, bY, box[0].x, box[0].y, box[3].x, box[3].y));
    intersections.push(getLineIntersection(aX, aY, bX, bY, box[1].x, box[1].y, box[2].x, box[2].y));
    intersections.push(getCircleIntersection(aX, aY, bX, bY, c1_x, c1_y, r));
  } else {
    i = getCircleIntersections(aX, aY, bX, bY, c1_x, c1_y, r);
    var j = getCircleIntersections(aX, aY, bX, bY, c0_x, c0_y, r);
    if (i) intersections.push(i[0], i[1]);
    if (j) intersections.push(j[0], j[1]);
    intersections.push(getLineIntersection(aX, aY, bX, bY, box[0].x, box[0].y, box[3].x, box[3].y));
    intersections.push(getLineIntersection(aX, aY, bX, bY, box[1].x, box[1].y, box[2].x, box[2].y));
  }
  var intersection = { x: aX, y: aY };
  for (var n = 0; n < (intersections.length); n++) {
    if (intersections[n]) {
      if (getDistance(intersections[n].x, intersections[n].y, bX, bY) < getDistance(intersection.x, intersection.y, bX, bY)) {
        intersection = intersections[n];
      }
    }
  }
  if (intersection.x === aX && intersection.y === aY) return null;
  return intersection;
}

/*
 * Use this when neither of the points are in the capsule.
 *  Takes aX, aY: the coordinates of the point inside the capsule
 * Takes bX, bY: the coordinates of the point outside the circle
 * Takes c0_x, c0_y, c1_x, c1_y, r: the parameters that define the capsule: the line segment from c0 to c1 and the radius
 * Returns an array of two arrays,
 *   containing the coordinates of the points of intersection between the line segment between A and B and the capsule
 * Returns null if the line segment AB does not intersect with the capsule
 */
function getCapsuleIntersections(aX, aY, bX, bY, c0_x, c0_y, c1_x, c1_y, r) {
  var box = getParallelSegments(c0_x, c0_y, c1_x, c1_y, r),
    intersections = [];

  var tmp = getCircleIntersections(aX, aY, bX, bY, c0_x, c0_y, r);
  if (tmp) intersections.push(tmp[0], tmp[1]);
  tmp = getCircleIntersections(aX, aY, bX, bY, c1_x, c1_y, r);
  if (tmp) intersections.push(tmp[0], tmp[1]);
  intersections.push(getLineIntersection(aX, aY, bX, bY, box[0].x, box[0].y, box[3].x, box[3].y));
  intersections.push(getLineIntersection(aX, aY, bX, bY, box[1].x, box[1].y, box[2].x, box[2].y));

  // the farthest possible intersection to each point A or B would be B and A, respectively
  var intersection0 = { x: bX, y: bY },
    intersection1 = { x: aX, y: aY };
  for (var n = 0; n < intersections.length; n++) {
    if (intersections[n]) {
      if (getDistance(intersections[n].x, intersections[n].y, aX, aY) < getDistance(intersection0.x, intersection0.y, aX, aY)) {
        intersection0 = intersections[n];
      }
    }
  }
  for (var m = 0; m < intersections.length; m++) {
    if (intersections[m]) {
      if (getDistance(intersections[m].x, intersections[m].y, bX, bY) < getDistance(intersection1.x, intersection1.y, bX, bY)) {
        intersection1 = intersections[m];
      }
    }
  }
  if ((intersection0.x === bX && intersection0.y === bY) || (intersection1.x === aX && intersection1.y === aY)) return null;
  else return [intersection0, intersection1];
}

/*
 * Takes an array of coordinates P.
 * Returns the length of that vector (distance from the origin to point P).
 */
var getLength = function(P) {
  return Math.sqrt(P[0] * P[0] + P[1] * P[1]);
};

var EPS = 1e-6;

/*
 * Takes the points A and B (length 2 arrays): the points that define the line segment.
 * Takes P: the point in question.
 * Returns the closest point on the line segment AB to point P.
 */
var getClosestPointOnSegment = function(A, B, P) {
  var AB = [B[0] - A[0], B[1] - A[1]],
    len = getLength(AB);
  if (len < EPS) return A;
  var PA = [P[0] - A[0], P[1] - A[1]];
  var k = (AB[0] * PA[0] + AB[1] * PA[1]) / len;
  if (k < 0) return A;
  if (k > len) return B;
  return [A[0] + AB[0] * k / len, A[1] + AB[1] * k / len];
};

/*
 * Used as an alternative to JSON.parse(JSON.stringify(path))
 */
var createNewPath = function(path) {
  var newCreatedPath = {};
  for (var key in path) {
    if (typeof path[key] === 'string') newCreatedPath[key] = path[key].slice();
    else if (Array.isArray(path[key])) newCreatedPath[key] = path[key].slice();
  }
  return newCreatedPath;
};