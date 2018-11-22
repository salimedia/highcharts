/* eslint-disable */
/* eslint-env node,es6 */
/* *
 * (c) 2010-2018 Torstein Honsi
 *
 * License: www.highcharts.com/license
 *
 * @module tools/tree-complete.js
 * @author Sophie Bremer
 */

const FS = require('fs');

const treeNamespace = require('../tree-namespace.json');
const treeOptions = { children: require('../tree.json'), doclet: {}, meta: {} };
let highchartsNamespace = findMember('Highcharts');

if (!highchartsNamespace) {
    console.error('Highcharts namespace in tree-namespace.json not found!');
    process.exit(1);
    return;
}

prepareOptions(treeOptions);
extendOptions(treeOptions);
transferOptionsInterface(treeOptions, treeNamespace);

FS.writeFileSync(
    'tree-complete.json',
    JSON.stringify(treeNamespace, undefined, '\t')
);

/* *
 *
 *  Functions
 *
 * */

function cloneObject (obj, maxDepth) {

    if (obj === null ||
        obj === undefined ||
        typeof obj !== 'object'
    ) {
        return obj;
    }

    const nextMaxDepth = ((typeof maxDepth === undefined ? 3 : maxDepth) - 1);

    if (obj instanceof Array) {
        const duplicatedArray = obj.slice();
        if (nextMaxDepth >= 0) {
            duplicatedArray.map(item => cloneObject(item, nextMaxDepth));
        }
        return duplicatedArray;
    }

    if (obj.constructor.prototype !== Object.prototype) {
        return obj;
    }

    const cloneObj = {};
    const keys = Object.keys(obj);

    if (nextMaxDepth < 0) {
        keys.forEach(key => {
            cloneObj[key] = obj[key];
        });
    } else {
        keys.forEach(key => {
            cloneObj[key] = cloneObject(obj[key], nextMaxDepth);
        });
    }

    return cloneObj;
}

function cloneOption (sourceNode, targetNode) {

    const sourceDoclet = sourceNode.doclet;
    const sourceMeta = sourceNode.meta;
    const targetDoclet = targetNode.doclet;
    const targetExclude = (targetNode.doclet.exclude || []);
    const targetMeta = targetNode.meta;
    const targetName = (targetMeta.fullname || targetMeta.name);

    const sourceChildren = sourceNode.children;
    const targetChildren = targetNode.children;

    Object
        .keys(sourceDoclet)
        .filter(key => (
            key !== 'extends' &&
            key !== 'exclude' &&
            typeof targetDoclet[key] === 'undefined'
        ))
        .forEach(key => targetDoclet[key] = cloneObject(
            sourceDoclet[key], Number.MAX_SAFE_INTEGER
        ));

    Object
        .keys(sourceMeta)
        .filter(key => typeof targetMeta[key] === 'undefined')
        .forEach(key => targetMeta[key] = cloneObject(
            sourceMeta[key], Number.MAX_SAFE_INTEGER
        ));

    Object
        .keys(sourceChildren)
        .filter(key => targetExclude.indexOf(key) === -1)
        .forEach(key => {

            if (!targetChildren[key]) {
                targetChildren[key] = {
                    children: {},
                    doclet: {},
                    meta: {
                        filename: sourceMeta.filename,
                        fullname: (targetName && targetName + key),
                        line: sourceMeta.line,
                        lineEnd: sourceMeta.lineEnd,
                        name: key
                    }
                }
            }

            cloneOption(sourceChildren[key], targetChildren[key]);
        });

}

function extendOptions (node) {

    const children = node.children;
    const extNodes = node.doclet.extends;

    if (extNodes &&
        extNodes.length > 0
    ) {
        delete node.doclet.extends;
        extNodes.forEach(extName => {
            const extNode = findOption(extName);
            if (!extNode) {
                console.error(
                    'Extends: Node ' + extName + ' not found.', node.meta.name
                );
                return;
            }
            cloneOption(extNode, node);
        });
    }

    Object
        .keys(children)
        .forEach(key => extendOptions(children[key]));

}

function findMember (name) {

    let currentNode = treeNamespace,
        found = false;

    getNamespaces(name).every(s => {
        found = currentNode.children.some(child => {
            if (child.doclet.name !== name) {
                return false;
            }
            currentNode = child;
            return true;
        });
        if (found) {
            return true;
        }
        currentNode = undefined;
        return false
    });

    return currentNode;

}

function findOption (name) {

    let currentNode = treeOptions;

    getNamespaces(name).every(s => {
        currentNode = currentNode.children[s];
        if (!currentNode) {
            return false;
        }
        if (currentNode.doclet.extends) {
            extendOptions(currentNode);
        }
        return true;
    });

    return currentNode;

}

function getCamelCaseName (name) {

    return (
        getNamespaces(name)
            .map(n => (n ? n[0].toUpperCase() + n.substr(1) : ''))
            .join('')
            .replace(/Options/g, '') +
            'Options'
    );

}

function getNamespaces (name, withFullNames) {

    if (!name) {
        return [];
    }

    const subspace = (name.match(/(?:<.+>|\[.+\])$/g) || [])[0];

    if (subspace) {
        name = name.substr(0, name.length - subspace.length);
    }

    let namespaces = name
        .replace(/\w+\:/g, '$&.')
        .split('.');

    if (subspace) {
        if (subspace.test(/\:(?!number|string)/g)) {
            subspace = subspace.replace(':', ' in ');
        }
        namespaces[namespaces.length-1] += subspace;
    }

    namespaces = namespaces.filter(s => !!s);

    if (withFullNames) {
        let fullSpace = '';
        namespaces = namespaces.map(space => {

            if (fullSpace) {
                fullSpace += '.' + space;
            }
            else {
                fullSpace = space;
            }

            return fullSpace;
        });
    }

    return namespaces;
}

function getSeeLinks (node) {

    return (node.doclet.products || ['highcharts']).map(product => (
        'https://api.highcharts.com/' + product + '/' + (node.fullname || '')
    ));

}

function prepareOptions (node, name, parentName) {

    const children = node.children;
    const childrenKeys = Object.keys(children);
    const doclet = node.doclet;
    const meta = node.meta;

    meta.name = (name || '');
    meta.fullname = (parentName ? parentName + '.' : '' ) + meta.name;

    if (typeof doclet.extends === 'string') {
        doclet.extends = doclet.extends
            .split(/[\s,]+/g)
            .filter(x => !!x.trim())
            .map(x => {
                if (/^{.+}$/.test(x)) {
                    console.error(
                        meta.fullname,
                        'Curly brackets notation should be avoided:',
                        x
                    );
                    x = x.replace(/^{(.+)}$/, '$1');
                }
                return (x === 'series' ? 'plotOptions.series' : x);
            })
            .sort(x => x === 'plotOptions.series' ? 1 : 0);
    }
    doclet.types = (doclet.type && doclet.type.names || []);
    delete doclet.type;

    childrenKeys
        .filter(key => {
            if (key[0] === '_') {
                delete children[key];
                return false;
            } else {
                return true;
            }
        })
        .forEach(key => prepareOptions(children[key], key, meta.fullname));

}

function transferOptionsInterface (sourceNode) {

    const children = sourceNode.children;
    const doclet = sourceNode.doclet;
    const meta = sourceNode.meta;

    const targetName = getCamelCaseName(meta.fullname);
    const targetClone = {
        doclet: {
            description: (doclet.description || ''),
            kind: 'interface',
            name: 'Highcharts.' + targetName,
            see: getSeeLinks(sourceNode)
        },
        meta: {
            files: [meta.files]
        },
        children: []
    };

    if (targetName === 'SeriesOptions') {
        Object
            .keys(children)
            .map(key => children[key])
            .forEach(child => (
                Object.keys(child.children).length === 0 ?
                transferOptionsProperty(child, targetClone) :
                transferOptionsSeries(child, targetClone)
            ));
    }
    else {
        Object
            .keys(children)
            .map(key => children[key])
            .forEach(child => transferOptionsProperty(child, targetClone));
    }

    highchartsNamespace.children.push(targetClone);

    return targetClone;

}

function transferOptionsProperty (sourceNode, targetNode) {

    const doclet = sourceNode.doclet;
    const meta = sourceNode.meta;
/*
    if (Object.keys(sourceNode.children).length > 0) {
        const clone = transferOptionsInterface(sourceNode);
        clone.doclet.types = sourceNode.doclet.typesd
            .map(type => Config.mapType(type))
            .map(type => {
                if (/\*//*.test(type) &&
                    interfaceDeclaration
                ) {
                    replacedAnyType = true;
                    return type.replace(
                        /\*//*g,
                        interfaceDeclaration.name
                    );
                }
                return type;
            });

        if (!replacedAnyType) {
            sourceNode.doclet.type.names.push(
                interfaceDeclaration.fullName
            );
        }
    }

    let declaration = new TSD.PropertyDeclaration(
        sourceNode.meta.name || ''
    );

    if (doclet.description) {
        declaration.description = doclet.description;
    }

    if (doclet.see) {
        declaration.see.push(...doclet.see);
    }

    if (sourceNode.meta.fullname !== 'series.type') {
        declaration.isOptional = true;
    }

    let isValueType = false;

    if (doclet.values) {
        let values = Utils.json(doclet.values, true);
        if (values instanceof Array) {
            let mergedTypes = Utils.uniqueArray(
                declaration.types, values.map(Config.mapValue)
            );
            declaration.types.length = 0;
            declaration.types.push(...mergedTypes);
            isValueType = true;
        }
    }

    if (!isValueType &&
        doclet.type
    ) {
        let mergedTypes = Utils.uniqueArray(
            declaration.types, doclet.type.names
        );
        declaration.types.length = 0;
        declaration.types.push(...mergedTypes);
    }

    targetDeclaration.addChildren(declaration);

    return declaration;
*/
}

function transferOptionsSeries (sourceNode) {
    console.log(sourceNode.meta.fullname);
}
