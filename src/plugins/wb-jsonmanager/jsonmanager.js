/**
 * @title WET-BOEW JSON Manager
 * @overview Manage JSON dataset, execute JSON patch operation.
 * @license wet-boew.github.io/wet-boew/License-en.html / wet-boew.github.io/wet-boew/Licence-fr.html
 * @author @duboisp
 */
/*global jsonpointer, jsonpatch */
( function( $, window, wb ) {
"use strict";

/*
 * Variable and function definitions.
 * These are global to the plugin - meaning that they will be initialized once per page,
 * not once per instance of plugin on the page. So, this is a good place to define
 * variables that are common to all instances of the plugin on a page.
 */
var componentName = "wb-jsonmanager",
	selector = "[data-" + componentName + "]",
	initEvent = "wb-init." + componentName,
	postponeEvent = "postpone." + componentName,
	patchesEvent = "patches." + componentName,
	jsonFailedClass = "jsonfail",
	reloadFlag = "data-" + componentName + "-reload",
	dsNameRegistered = [],
	datasetCache = {},
	datasetCacheSettings = {},
	dsDelayed = {},
	dsPostponePatches = {},
	$document = wb.doc,
	defaults = {
		ops: [
			{
				name: "wb-count",
				fn: function( obj, key, tree ) {
					var countme = obj[ key ],
						len = 0, i_len, i,
						filter = this.filter || [ ],
						filternot = this.filternot || [ ];

					if ( !$.isArray( filter ) ) {
						filter = [ filter ];
					}
					if ( !$.isArray( filternot ) ) {
						filternot = [ filternot ];
					}

					if ( ( filter.length || filternot.length ) && $.isArray( countme ) ) {

						// Iterate in obj[key] / item and check if is true for the given path is any.
						i_len = countme.length;

						for ( i = 0; i !== i_len; i = i + 1 ) {
							if ( filterPassJSON( countme[ i ], filter, filternot ) ) {
								len = len + 1;
							}
						}
					} else if ( $.isArray( countme ) ) {
						len = countme.length;
					}
					jsonpatch.apply( tree, [
						{ op: "add", path: this.set, value: len }
					] );
				}
			},
			{
				name: "wb-first",
				fn: function( obj, key, tree ) {
					var currObj = obj[ key ];
					if ( !$.isArray( currObj ) || currObj.length === 0 ) {
						return;
					}

					jsonpatch.apply( tree, [
						{ op: "add", path: this.set, value: currObj[ 0 ] }
					] );
				}
			},
			{
				name: "wb-last",
				fn: function( obj, key, tree ) {
					var currObj = obj[ key ];
					if ( !$.isArray( currObj ) || currObj.length === 0 ) {
						return;
					}

					jsonpatch.apply( tree, [
						{ op: "add", path: this.set, value: currObj[ currObj.length - 1 ] }
					] );
				}
			},
			{
				name: "wb-nbtolocal",
				fn: function( obj, key, tree ) {
					var val = obj[ key ],
						loc = this.locale || window.wb.lang,
						suffix = this.suffix || "",
						prefix = this.prefix || "";

					if ( typeof val === "string" ) {
						val = parseFloat( val );
						if ( isNaN( val ) ) {
							return;
						}
					}

					jsonpatch.apply( tree, [
						{ op: "replace", path: this.path, value: prefix + val.toLocaleString( loc ) + suffix  }
					] );
				}
			},
			{
				name: "wb-decodeUTF8Base64",
				fn: function( obj, key, tree ) {
					var val = obj[ key ];

					if ( !this.set ) {
						jsonpatch.apply( tree, [
							{ op: "replace", path: this.path, value: wb.decodeUTF8Base64( val ) }
						] );
					} else {
						jsonpatch.apply( tree, [
							{ op: "add", path: this.set, value: wb.decodeUTF8Base64( val ) }
						] );
					}
				}
			},
			{
				name: "wb-escapeHTML",
				fn: function( obj, key, tree ) {
					var val = obj[ key ];

					if ( !this.set ) {
						jsonpatch.apply( tree, [
							{ op: "replace", path: this.path, value: wb.escapeHTML( val ) }
						] );
					} else {
						jsonpatch.apply( tree, [
							{ op: "add", path: this.set, value: wb.escapeHTML( val ) }
						] );
					}
				}
			},
			{
				name: "wb-toDateISO",
				fn: function( obj, key, tree ) {
					if ( !this.set ) {
						jsonpatch.apply( tree, [
							{ op: "replace", path: this.path, value: wb.date.toDateISO( obj[ key ] ) }
						] );
					} else {
						jsonpatch.apply( tree, [
							{ op: "add", path: this.set, value: wb.date.toDateISO( obj[ key ] ) }
						] );
					}
				}
			},
			{
				name: "wb-toDateTimeISO",
				fn: function( obj, key, tree ) {
					if ( !this.set ) {
						jsonpatch.apply( tree, [
							{ op: "replace", path: this.path, value: wb.date.toDateISO( obj[ key ], true ) }
						] );
					} else {
						jsonpatch.apply( tree, [
							{ op: "add", path: this.set, value: wb.date.toDateISO( obj[ key ], true ) }
						] );
					}
				}
			}
		],
		opsArray: [
			{
				name: "wb-toDateISO",
				fn: function( arr )  {
					var setval = this.set,
						pathval = this.path,
						i, i_len = arr.length;
					for ( i = 0; i !== i_len; i += 1 ) {
						if ( setval ) {
							jsonpatch.apply( arr, [
								{ op: "wb-toDateISO", set: "/" + i + setval, path: "/" + i + pathval }
							] );
						} else {
							jsonpatch.apply( arr, [
								{ op: "wb-toDateISO", path: "/" + i + pathval }
							] );
						}
					}
				}
			},
			{
				name: "wb-toDateTimeISO",
				fn: function( arr ) {
					var setval = this.set,
						pathval = this.path,
						i, i_len = arr.length;
					for ( i = 0; i !== i_len; i += 1 ) {
						if ( setval ) {
							jsonpatch.apply( arr, [
								{ op: "wb-toDateTimeISO", set: "/" + i + setval, path: "/" + i + pathval }
							] );
						} else {
							jsonpatch.apply( arr, [
								{ op: "wb-toDateTimeISO", path: "/" + i + pathval }
							] );
						}
					}
				}
			}
		],
		opsRoot: [],
		settings: { },
		docMapKeys: { "referer": document.referrer, "locationHref": location.href }
	},

	// Add debug information after the JSON manager element
	debugPrintOut = function( $elm, name, json, patches ) {
		$elm.after( "<p lang=\"en\"><strong>JSON Manager Debug</strong> (" +  name + ")</p><ul lang=\"en\"><li>JSON: <pre><code>" + JSON.stringify( json ) + "</code></pre></li><li>Patches: <pre><code>" + JSON.stringify( patches ) + "</code></pre>" );
		console.log( json );
	},

	/**
	 * @method init
	 * @param {jQuery Event} event Event that triggered the function call
	 */
	init = function( event ) {

		// Start initialization
		// returns DOM object = proceed with init
		// returns undefined = do not proceed with init (e.g., already initialized)
		var elm = wb.init( event, componentName, selector ),
			$elm,
			jsSettings = window[ componentName ] || { },
			ops, opsArray, opsRoot,
			i, i_len, i_cache,
			url, dsName;

		if ( elm ) {
			$elm = $( elm );

			// Load handlebars
			Modernizr.load( {

				// For loading multiple dependencies
				load: [
					"site!deps/json-patch" + wb.getMode() + ".js",
					"site!deps/jsonpointer" + wb.getMode() + ".js"
				],
				testReady: function() {
					return window.jsonpatch && window.jsonpointer;
				},
				complete: function() {
					var elmData = wb.getData( $elm, componentName );

					if ( !defaults.registered ) {
						ops = defaults.ops.concat( jsSettings.ops || [ ] );
						opsArray = defaults.opsArray.concat( jsSettings.opsArray || [ ] );
						opsRoot = defaults.opsRoot.concat( jsSettings.opsRoot || [ ] );

						if ( ops.length ) {
							for ( i = 0, i_len = ops.length; i !== i_len; i++ ) {
								i_cache = ops[ i ];
								jsonpatch.registerOps( i_cache.name, i_cache.fn );
							}
						}
						if ( opsArray.length ) {
							for ( i = 0, i_len = opsArray.length; i !== i_len; i++ ) {
								i_cache = opsArray[ i ];
								jsonpatch.registerOpsArray( i_cache.name, i_cache.fn );
							}
						}
						if ( opsRoot.length ) {
							for ( i = 0, i_len = opsRoot.length; i !== i_len; i++ ) {
								i_cache = opsRoot[ i ];
								jsonpatch.registerOpsRoot( i_cache.name, i_cache.fn );
							}
						}
						defaults.settings = $.extend( {}, defaults.settings, jsSettings.settings || {} );
						defaults.registered = true;
					}

					dsName = elmData.name;
					if ( !dsName || dsName in dsNameRegistered ) {
						throw "Dataset name must be unique";
					}
					dsNameRegistered.push( dsName );

					url = elmData.url;

					if ( url ) {

						// Fetch the JSON
						$elm.trigger( {
							type: "json-fetch.wb",
							fetch: {
								url: url,
								nocache: elmData.nocache,
								nocachekey: elmData.nocachekey,
								data: elmData.data,
								contentType: elmData.contenttype,
								method: elmData.method
							}
						} );

						// If the URL is a dataset, make it ready
						if ( url.charCodeAt( 0 ) === 35 && url.charCodeAt( 1 ) === 91 ) {
							wb.ready( $elm, componentName );
						}
					} else if ( !url && elmData.extractor ) {
						$elm.trigger( {
							type: "json-fetched.wb",
							fetch: {
								response: {}
							}
						} );
						wb.ready( $elm, componentName );

					} else {

						$elm.trigger( {
							type: "json-fetch.wb"
						} );
						wb.ready( $elm, componentName );
					}

				}
			} );
		}
	},
	extractData = function( elmObj ) {

		var isGroup = false,
			selectedTag,
			targetTag,
			lastIndex = [],
			j_tag = "",
			group = {},
			arrMap = [],
			node_children = [],
			j_node = 0,
			arrRepeatPath = [],
			combineToObj = function( cur_obj ) {
				if ( cur_obj.selector === j_tag ) {
					if ( !lastIndex.includes( j_tag ) ) {
						group[ cur_obj.path ] = cur_obj.attr && node_children[ j_node ].getAttributeNode( cur_obj.attr ) ?
							node_children[ j_node ].getAttributeNode( cur_obj.attr ).textContent :
							node_children[ j_node ].textContent;
						lastIndex.push( j_tag );
					}
				}
			},
			manageObjDir = function( selector, selectedValue, json_return ) {
				var arrPath = selector.path.split( "/" ).filter( Boolean );
				if ( arrPath.length > 1 ) {
					var pointer = "";
					pointer = arrPath.pop();

					if ( arrPath[ 0 ] && arrPath[ 0 ] !== "" ) {

						if ( !json_return[ arrPath[ 0 ] ] && !arrRepeatPath.includes( arrPath[ 0 ] ) ) {
							arrRepeatPath.push( arrPath[ 0 ] );
							json_return[ arrPath[ 0 ] ] = {};
						}
						if ( selector.selectAll && !json_return[ arrPath[ 0 ] ] [ pointer ]  ) {
							json_return[ arrPath[ 0 ] ] [ pointer ] = [];
						}
						if ( selector.selectAll ) {
							json_return[ arrPath[ 0 ] ] [ pointer ].push( selectedValue );
						} else {
							json_return[ arrPath[ 0 ] ] [ pointer ] = selectedValue;
						}

					} else {

						if ( selector.selectAll ) {
							json_return[ arrPath[ 0 ] ].push( selectedValue );
						} else {
							json_return[ pointer ] = selectedValue;
						}
					}
				} else {

					if ( selector.selectAll ) {
						if ( !json_return[ selectedTag.path ] ) {
							json_return[ selectedTag.path ] = [];
						}
						json_return[ selectedTag.path ].push( selectedValue );
					} else {
						json_return[ selectedTag.path ] = selectedValue;
					}
				}
			},
			jsonSource = {};


		for ( var tag = 0; tag <= elmObj.length - 1; tag++ ) {

			selectedTag = elmObj[ tag ];

			if ( !selectedTag.interface ) {

				targetTag = document.querySelectorAll( selectedTag.selector || "" );
				isGroup = selectedTag.extractor && selectedTag.extractor.length >= 1 ? true : false;

				if ( selectedTag.selectAll ) {

					for ( var i_node = 0; i_node <= targetTag.length - 1; i_node++ ) {

						var selectedTagValue = selectedTag.attr && targetTag [ i_node ].getAttributeNode( selectedTag.attr ) ?
							targetTag [ i_node ].getAttributeNode( selectedTag.attr ).textContent :
							targetTag [ i_node ].textContent;

						manageObjDir( selectedTag, selectedTagValue, jsonSource );
					}
				}

				// extract from combined selectors and group the values e.g dt with dd
				if ( isGroup ) {

					jsonSource[ selectedTag.path ] = [];

					node_children = targetTag[ 0 ].children;

					var extractorLength = Object.keys( selectedTag.extractor ).length;

					for ( j_node = 0; j_node <= node_children.length - 1; j_node++ ) {

						j_tag = node_children[ j_node ].tagName.toLowerCase();

						selectedTag.extractor.find( combineToObj );
						if ( Object.keys( group ).length === extractorLength ) {
							arrMap.push( group );
							group = {};
							lastIndex = [];
						}
					}
					$.extend( jsonSource[ selectedTag.path ], arrMap );
				}

				if ( targetTag.length ) {
					targetTag = selectedTag.attr && targetTag [ 0 ].getAttributeNode( selectedTag.attr ) ?
						targetTag [ 0 ].getAttributeNode( selectedTag.attr ).textContent :
						targetTag [ 0 ].textContent;
				}

			} else {

				targetTag = defaults.docMapKeys[ selectedTag.interface ];

				manageObjDir( selectedTag, targetTag, jsonSource );
			}

			if ( !selectedTag.selectAll  ) {
				if ( isGroup === false ) {
					manageObjDir( selectedTag, targetTag, jsonSource );
				}
			}
		}

		return jsonSource;
	},

	// Filtering a JSON
	// Return true if trueness && falseness
	// Return false if !( trueness && falseness )
	// trueness and falseness is an array of { "path": "", "value": "" } object
	filterPassJSON = function( obj, trueness, falseness ) {
		var i, i_cache,
			trueness_len = trueness.length,
			falseness_len = falseness.length,
			compareResult = false,
			isEqual;

		if ( trueness_len || falseness_len ) {

			for ( i = 0; i < trueness_len; i += 1 ) {
				i_cache = trueness[ i ];
				isEqual = _equalsJSON( jsonpointer.get( obj, i_cache.path ), i_cache.value );

				if ( i_cache.optional ) {
					compareResult = compareResult || isEqual;
				} else if ( !isEqual ) {
					return false;
				} else {
					compareResult = true;
				}
			}
			if ( trueness_len && !compareResult ) {
				return false;
			}

			for ( i = 0; i < falseness_len; i += 1 ) {
				i_cache = falseness[ i ];
				isEqual = _equalsJSON( jsonpointer.get( obj, i_cache.path ), i_cache.value );

				if ( isEqual && !i_cache.optional || isEqual && i_cache.optional ) {
					return false;
				}
			}

		}
		return true;
	},

	// Utility function to compare two JSON value
	_equalsJSON = function( a, b ) {
		switch ( typeof a ) {
		case "undefined":
			return false;
		case "boolean":
		case "string":
		case "number":
			return a === b;
		case "object":
			if ( a === null ) {
				return b === null;
			}
			var i, l;
			if ( $.isArray( a ) ) {
				if (  $.isArray( b ) || a.length !== b.length ) {
					return false;
				}
				for ( i = 0, l = a.length; i < l; i++ ) {
					if ( !_equalsJSON( a[ i ], b[ i ] ) ) {
						return false;
					}
				}
				return true;
			}
			var bKeys = _objectKeys( b ),
				bLength = bKeys.length;
			if ( _objectKeys( a ).length !== bLength ) {
				return false;
			}
			for ( i = 0; i < bLength; i++ ) {
				if ( !_equalsJSON( a[ i ], b[ i ] ) ) {
					return false;
				}
			}
			return true;
		default:
			return false;
		}
	},
	_objectKeys = function( obj ) {
		var keys;
		if ( $.isArray( obj ) ) {
			keys = new Array( obj.length );
			for ( var k = 0; k < keys.length; k++ ) {
				keys[ k ] = "" + k;
			}
			return keys;
		}
		if ( Object.keys ) {
			return Object.keys( obj );
		}
		keys = [];
		for ( var i in obj ) {
			if ( Object.prototype.hasOwnProperty.call( obj, i ) ) {
				keys.push( i );
			}
		}
		return keys;
	},

	// Create series of patches for filtering
	getPatchesToFilter = function( JSONsource, filterPath, filterTrueness, filterFaslseness ) {
		var filterObj,
			i, i_len;

		if ( !$.isArray( filterTrueness ) ) {
			filterTrueness = [ filterTrueness ];
		}
		if ( !$.isArray( filterFaslseness ) ) {
			filterFaslseness = [ filterFaslseness ];
		}

		filterObj = jsonpointer.get( JSONsource, filterPath );
		if ( $.isArray( filterObj ) ) {
			i_len = filterObj.length - 1;
			for ( i = i_len; i !== -1; i -= 1 ) {
				if ( !filterPassJSON( filterObj[ i ], filterTrueness, filterFaslseness ) ) {
					jsonpatch.apply( JSONsource, [ { op: "remove", path: filterPath + "/" + i } ] );
				}
			}
		}
		return JSONsource;
	};

// IE dedicated patch to support ECMA-402 but limited to English and French number formatting
if ( wb.ie ) {
	Number.prototype.toLocaleString = function( locale ) {

		var splitVal = this.toString().split( "." ),
			integer = splitVal[ 0 ],
			decimal = splitVal[ 1 ],
			intLength = integer.length,
			nbSection = intLength % 3 || 3,
			strValue = integer.substr( 0, nbSection ),
			isFrenchLoc = ( locale === "fr" ),
			thousandSep = ( isFrenchLoc ? " " : "," ),
			i;

		for ( i = nbSection; i < intLength; i = i + 3 ) {
			strValue = strValue + thousandSep + integer.substr( i, 3 );
		}
		if ( decimal.length ) {
			if ( isFrenchLoc ) {
				strValue = strValue + "," + decimal;
			} else {
				strValue = strValue + "." + decimal;
			}
		}
		return strValue;
	};
}

$document.on( "json-failed.wb", selector, function( event ) {
	var elm = event.target,
		$elm;

	if ( elm === event.currentTarget ) {
		$elm = $( elm );
		$elm.addClass( jsonFailedClass );

		// Identify that initialization has completed
		wb.ready( $elm, componentName );
	}
} );

$document.on( "json-fetched.wb", selector, function( event ) {
	var elm = event.target,
		$elm = $( elm ),
		settings,
		dsName,
		JSONresponse = event.fetch.response,
		isArrayResponse = $.isArray( JSONresponse ),
		resultSet,
		i, i_len, i_cache, backlog, selector,
		patches, filterTrueness, filterFaslseness, filterPath, extractor;

	if ( elm === event.currentTarget ) {
		settings = wb.getData( $elm, componentName );

		extractor = settings.extractor;
		if ( extractor ) {
			if ( !$.isArray( extractor ) ) {
				extractor = [ extractor ];
			}
			JSONresponse = $.extend( JSONresponse, extractData( extractor ) );

		}

		dsName = "[" + settings.name + "]";
		patches = settings.patches || [];
		filterPath = settings.fpath;
		filterTrueness = settings.filter || [];
		filterFaslseness = settings.filternot || [];

		if ( !$.isArray( patches ) ) {
			patches = [ patches ];
		}

		if ( isArrayResponse ) {
			JSONresponse = $.extend( true, [], JSONresponse );
		} else {
			JSONresponse = $.extend( true, {}, JSONresponse );
		}

		// Apply a filtering
		if ( filterPath ) {
			JSONresponse = getPatchesToFilter( JSONresponse, filterPath, filterTrueness, filterFaslseness );
		}

		// Apply the wraproot
		if ( settings.wraproot  ) {
			i_cache = { };
			i_cache[ settings.wraproot ] = JSONresponse;
			JSONresponse = i_cache;
		}

		// Apply the patches
		if ( patches.length ) {
			jsonpatch.apply( JSONresponse, patches );
		}
		if ( settings.debug ) {
			debugPrintOut( $elm, "initEvent", JSONresponse, patches );
		}

		try {
			datasetCache[ dsName ] = JSONresponse;
		} catch ( error ) {
			return;
		}
		datasetCacheSettings[ dsName ] = settings;

		if ( elm.hasAttribute( reloadFlag ) ) {
			elm.removeAttribute( reloadFlag );
			i_cache = dsPostponePatches[ dsName ];
			if ( i_cache ) {
				$elm.trigger( i_cache );
			}
		}

		if ( !settings.wait && dsDelayed[ dsName ] ) {
			backlog = dsDelayed[ dsName ];
			i_len = backlog.length;
			for ( i = 0; i !== i_len; i += 1 ) {
				i_cache = backlog[ i ];
				selector = i_cache.selector;
				if ( selector.length ) {
					try {
						resultSet = jsonpointer.get( JSONresponse, selector );
					} catch  ( e ) {
						throw dsName + " - JSON selector not found: " + selector;
					}
				} else {
					resultSet = JSONresponse;
				}
				$( "#" + i_cache.callerId ).trigger( {
					type: "json-fetched.wb",
					fetch: {
						response: resultSet,
						status: "200",
						refId: i_cache.refId,
						xhr: null
					}
				}, this );
			}
		}

		// Identify that initialization has completed
		wb.ready( $elm, componentName );
	}
} );

// Apply patches to a preloaded JSON data
$document.on( patchesEvent, selector, function( event ) {
	var elm = event.target,
		$elm = $( elm ),
		patches = event.patches,
		filterPath = event.fpath,
		filterTrueness = event.filter || [],
		filterFaslseness = event.filternot || [],
		isCumulative = !!event.cumulative,
		settings,
		dsName,
		dsJSON, resultSet,
		delayedLst,
		i, i_len, i_cache, pntrSelector;

	if ( elm === event.currentTarget && $.isArray( patches ) ) {
		settings = wb.getData( $elm, componentName );

		if ( !settings ) {
			return true;
		}
		dsName = "[" + settings.name + "]";

		// Check if the patches need to be hold until the next json-fetch event
		if ( elm.hasAttribute( reloadFlag ) ) {
			dsPostponePatches[ dsName ] = event;
			return true;
		}

		if ( !dsDelayed[ dsName ] ) {
			throw "Applying patched on undefined dataset name: " + dsName;
		}

		dsJSON = datasetCache[ dsName ];
		if ( !isCumulative ) {
			dsJSON = $.extend( true, ( $.isArray( dsJSON ) ? [] : {} ), dsJSON );
		}

		// Apply a filtering
		if ( filterPath ) {
			dsJSON = getPatchesToFilter( dsJSON, filterPath, filterTrueness, filterFaslseness );
		}

		jsonpatch.apply( dsJSON, patches );

		if ( settings.debug ) {
			debugPrintOut( $elm, "patchesEvent", dsJSON, patches );
		}

		delayedLst = dsDelayed[ dsName ];
		i_len = delayedLst.length;
		for ( i = 0; i !== i_len; i += 1 ) {
			i_cache = delayedLst[ i ];
			pntrSelector = i_cache.selector;
			if ( pntrSelector.length ) {
				try {
					resultSet = jsonpointer.get( dsJSON, pntrSelector );
				} catch  ( e ) {
					throw dsName + " - JSON selector not found: " + pntrSelector;
				}
			} else {
				resultSet = dsJSON;
			}
			$( "#" + i_cache.callerId ).trigger( {
				type: "json-fetched.wb",
				fetch: {
					response: resultSet,
					status: "200",
					refId: i_cache.refId,
					xhr: null
				}
			}, this );
		}
	}
} );


// Used by the JSON-fetch plugin for when trying fetching a resource that is mapped a dataset name
$document.on( postponeEvent, function( event ) {
	var jsonPostpone = event.postpone,
		dsName = jsonPostpone.dsname,
		callerId = jsonPostpone.callerId,
		refId = jsonPostpone.refId,
		selector = jsonPostpone.selector,
		resultSet;

	if ( !dsDelayed[ dsName ] ) {
		dsDelayed[ dsName ] = [ ];
	}

	// Add to the delayed updates list
	dsDelayed[ dsName ].push( {
		"callerId": callerId,
		"refId": refId,
		"selector": selector
	} );

	// Send the data if the dataset is ready?
	if ( datasetCache[ dsName ] && !datasetCacheSettings[ dsName ].wait ) {
		resultSet = datasetCache[ dsName ];
		if ( selector.length ) {
			try {
				resultSet = jsonpointer.get( resultSet, selector );
			} catch  ( e ) {
				throw dsName + " - JSON selector not found: " + selector;
			}
		}
		$( "#" + callerId ).trigger( {
			type: "json-fetched.wb",
			fetch: {
				response: resultSet,
				status: "200",
				refId: refId,
				xhr: null
			}
		}, this );
	}

} );

/*
 * Integration with wb-fieldflow
 *
 */
function pushData( $elm, prop, data, reset ) {
	var dtCache = $elm.data( prop );
	if ( !dtCache || reset ) {
		dtCache = [];
	}
	dtCache.push( data );
	return $elm.data( prop, dtCache );
}

// Fieldflow "op" action
$document.on( "op.action.wb-fieldflow", ".wb-fieldflow", function( event, data ) {

	if ( !data.op ) {
		return;
	}

	// Postpone the event for form submission
	data.preventSubmit = true;
	pushData( $( data.provEvt ), "wb-fieldflow-submit", data );
} );

// Fieldflow "op" submit
$document.on( "op.submit.wb-fieldflow", ".wb-fieldflow", function( event, data ) {

	// Get the hbs Plugin
	var op = data.op,
		source = data.source,
		ops;

	if ( !op ) {
		return true;
	}

	if ( !$.isArray( op ) ) {
		ops = [];
		ops.push( op );
	} else {
		ops = op;
	}

	$( source ).trigger( {
		type: "patches.wb-jsonmanager",
		patches: ops
	} );
} );

// Bind the init event of the plugin
$document.on( "timerpoke.wb " + initEvent, selector, init );


// Add the timer poke to initialize the plugin
wb.add( selector );

} )( jQuery, window, wb );
