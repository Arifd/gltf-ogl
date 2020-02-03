import {Geometry} from './ogl/index.mjs';

export class GLTFLoader
{
	static async load(gl, src){
		//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
		// Create a gltf object from src
		let gltf = await this.loadJSON(src);
		// error check:
		if (gltf.asset === undefined || gltf.asset.version[0] < 2)
				console.error("GLTFLoader: Only GLTF versions 2.0 and above are supported");
		//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
		// Locate the bin file
		let bin = new ArrayBuffer();
		if (gltf.buffers[0].uri.includes("data:"))
			console.error("GLTFLoader: Currently only supports separate gltf and bin files");
		else if (gltf.buffers[0].uri === undefined)
			console.error("GLTFLoader: Currently only supports separate gltf and bin files");
		else bin = await this.loadArrayBuffer(gltf.buffers[0].uri);

		//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
		// Extract raw geometry data
		let extractedGLTFData = this.getMesh(gltf, bin);

		//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
		// Convert extracted data into OGL Geometry attributes format
		let attributes = {};
		for (const property in extractedGLTFData.attributes){
			if (property === "POSITION") attributes.position = {size: extractedGLTFData.attributes[property].size, data: extractedGLTFData.attributes[property].data};
			else if (property === "NORMAL") attributes.normal = {size: extractedGLTFData.attributes[property].size, data: extractedGLTFData.attributes[property].data};
			else if (property === "TEXCOORD_0") attributes.uv = {size: extractedGLTFData.attributes[property].size, data: extractedGLTFData.attributes[property].data};
			else attributes[property] = {size: extractedGLTFData.attributes[property].size, data: extractedGLTFData.attributes[property].data}
		}
		if (extractedGLTFData.indices) attributes.index = {size: extractedGLTFData.indices.size, data: extractedGLTFData.indices.data};

		//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
		// Add to an OGL Geometry object
		let geometry = new Geometry(gl, attributes);

		//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
		return geometry; // @Gordonnl: "this should return an object holding the different content. At the moment that would just be a gltf.geometries array, made up of objects with a name and an OGL Geometry attached."
	}

	static async loadJSON(src) {
    return await fetch(src)
          .then(response => response.json())
          .then(data => data);
    }

	static async loadArrayBuffer(src) {
    return await fetch(src)
          .then(response => response.arrayBuffer())
          .then(data => data);
    }

  static getMesh(json, bin)
  {
		//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
		// Find mesh to parse out
		// note: assuming only single primitive per single mesh for now
		let primitive = json.meshes[0].primitives[0];

		// How do we draw our geometry?
		// let mode = (primitive.mode != undefined)? primitive.mode : GLTF.MODE_TRIANGLES;

		//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
		// Parse out all the raw Geometry Data from the Bin file
		let attributeData = {};
		for (const property in primitive.attributes){
			attributeData[property] = this.parseAccessor(primitive.attributes[property], json, bin);
		}
		let extractedGLTFData = {};
		extractedGLTFData.attributes = attributeData;
		if (primitive.indices !== undefined) extractedGLTFData.indices = this.parseAccessor(primitive.indices, json, bin);

		//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
		return extractedGLTFData;
	}

	// Parse out a single buffer of data from the bin file based on an accessor index. (Vertices, Normal, etc)
	static parseAccessor(index, json, bin)
	{
		let accessor 				= json.accessors[index];									// Reference to Accessor JSON Element
		let	bufferView 			= json.bufferViews[accessor.bufferView];	// Buffer Information
		let componentLength = GLTF["COMP_" + accessor.type];					// Component Length for Data Element
		let	data 						= null;																		// Final Type array that will be filled with data
		let arrayType; 																								// Reference to Type Array to create
		let	func; 																										// Reference to GET function in Type Array

		//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
		// Figure out which Typed Array we need to save the data in
		switch(accessor.componentType){
			case GLTF.TYPE_FLOAT:						arrayType = Float32Array;		func = "getFloat32";	break;
			case GLTF.TYPE_SHORT:						arrayType = Int16Array;			func = "getInt16"; 		break;
			case GLTF.TYPE_UNSIGNED_SHORT: 	arrayType = Uint16Array;		func = "getUint16";		break;
			case GLTF.TYPE_UNSIGNED_INT:		arrayType = Uint32Array;		func = "getUint32";		break;
			case GLTF.TYPE_UNSIGNED_BYTE: 	arrayType = Uint8Array; 		func = "getUint8";		break;
			default: console.error("GLTFLoader.ParseAccesor: componentType unknown; ", accessor.componentType); return null; break;
		}

		//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
		// If data is interlaced
		if(bufferView.byteStride)
		{
			let stride					= bufferView.byteStride;					// Stride Length in bytes
			let	elementCount		= accessor.count; 								// How many stride elements exist.
			let	bufferOffset		= (bufferView.byteOffset || 0);		// Buffer Offset
			let	strideOffset		= (accessor.byteOffset || 0);			// Stride Offset
			let	bytesPerElement	= arrayType.BYTES_PER_ELEMENT;		// How many bytes to make one value of the data type
			let	arrayLength			= elementCount * componentLength;	// How many "floats/ints" need for this array
			let	dataView 				= new DataView(bin);							// Access to Binary Array Buffer
			let	k 							= 0;															// Position Index of new Type Array

			data	= new arrayType(arrayLength);									//Final Array

			// Loop through each element of byte stride
			for (let i = 0; i < elementCount; i++){
				// Buffer Offset + (Total Stride * Element Index) + Sub Offset within Stride Component
				let poisition = bufferOffset + (stride * i) + strideOffset;	//Calc starting position for the stride of data
				//Then loop by compLen to grab stuff out of the DataView and into the Typed Array
				for (let j = 0; j < componentLength; j++) ary[k++] = dataView[func](position + (j * bytesPerElement), true);
			}
		}
		//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
		// Data is NOT interlaced
		// https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#data-alignment
		// arrayType example from documentation works pretty well for data that is not interleaved.
		else{
			let bufferOffset = (accessor.byteOffset || 0) + (bufferView.byteOffset || 0);
			let elementCount = accessor.count;
			data = new arrayType(bin, bufferOffset, elementCount * componentLength);
		}

		//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
		return {data: data, size: componentLength}
	}
}

////////////////////////////////////////////////////////
// CONSTANTS
////////////////////////////////////////////////////////
var GLTF =
{
	MODE_POINTS 				: 0,
	MODE_LINES					: 1,
	MODE_LINE_LOOP			: 2,
	MODE_LINE_STRIP			: 3,
	MODE_TRIANGLES			: 4,
	MODE_TRIANGLE_FAN		: 6,

	TYPE_BYTE						: 5120,
	TYPE_UNSIGNED_BYTE	: 5121,
	TYPE_SHORT					: 5122,
	TYPE_UNSIGNED_SHORT	: 5123,
	TYPE_UNSIGNED_INT		: 5125,
	TYPE_FLOAT					: 5126,

	COMP_SCALAR					: 1,
	COMP_VEC2						: 2,
	COMP_VEC3						: 3,
	COMP_VEC4						: 4,
	COMP_MAT2						: 4,
	COMP_MAT3						: 9,
	COMP_MAT4						: 16
}