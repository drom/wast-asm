#!/usr/bin/env node
'use strict';

var spec = require('wast-spec'),
    esprima = require('esprima'),
    esotope = require('esotope');

// remove script
delete spec.visitorKeys['script'];

function hex (n) {
    if (n === undefined) {
      return n;
    }
    return ('0' + n.toString(16)).slice(-2);
}

var unparented = {
    identifier: true,
    literal: true,
    item: true
    // TODO add the rest
};

var compositeName = {
    binop: 'hex(operators.simple[node.type + \'.\' + node.operator])',
    relop: 'hex(operators.simple[node.type + \'.\' + node.operator])',
    cvtop: 'hex(operators.simple[node.type + \'.\' + node.operator + \'/\' + node.type1])',
    const: 'hex(operators.basic[node.type + \'.const\']) + \' \' + node.init',
    load:  'hex(operators.memory[node.type + \'.load\']) + \' \'',
    store: 'hex(operators.memory[node.type + \'.store\']) + \' \'',
    identifier: '\'$\' + node.name',
    item: `(node.name ? \'$\' + node.name + ' ': '') + node.type`,
    literal: `Number.isInteger(node.value) ? node.value : '"' + node.value + '"'`,
    result: `'result ' + node.type`
    // TODO add the rest
};

var arrayKeys = {
    body: true,
    params: true,
    exprs: true,
    items: true,
    segment: true,
    local: true
};

function parse (str) {
    return esprima.parse(str).body[0];
}

function bodyGen (obj, kind) {
    var objKinds = obj[kind],
        res = [];
    if (unparented[kind] === undefined) {
        res.push(parse(`res += indent`));
        res.push(parse(`res += '('`));
    } else {
        res.push(parse(`res += ' '`));
    }
    if (compositeName[kind] === undefined) {
        res.push(parse(`res += '${
           hex(spec.operators.basic[kind] ||
           spec.operators.control[kind] ||
           spec.operators.memory[kind]) || kind
         }'`));
    } else {
        res.push(parse('res += ' + compositeName[kind]));
    }
    if (objKinds.length > 0) {
        res.push(parse(`indent += spaceString`));
        objKinds.forEach(function (key) {
            if (arrayKeys[key] === undefined) {
                res.push(parse(
                    `if (node.${key}) {
                        exprGen[node.${key}.kind](node.${key});
                    }`
                ));
            } else {
                res.push(parse(
                    `node.${key}.forEach(function (e) {
                        exprGen[e.kind](e);
                    });`
                ));
            }
        });
        res.push(parse(`indent = indent.slice(0,-spaceNum)`));
    }
    if (unparented[kind] === undefined) {
        res.push(parse(`res += ')'`));
    }
    return res;
}

function funcObject (obj) {
    var res = esprima.parse(`
        'use strict';
        var res, indent, spaceNum, spaceString;
        var exprGen = {};
        var operators = ${JSON.stringify(spec.operators)};
        function hex (n) { if (n === undefined) return n; return ('0' + n.toString(16)).slice(-2) }
        function gen (node, space) {
            res = '';
            spaceString = ''
            spaceNum = space
            if (space) {
              for(var i=0; i<space; i++){
                spaceString += ' '
              }
              indent = '\\n';
            } else {
              indent = ''
            }

            // remove script
            if(node.kind === 'script'){
              node.body.forEach(function(n){
                exprGen[n.kind](n);
              })
            }else{
              exprGen[node.kind](node);
            }

            // trims leading newline
            if (space) {
              res = res.slice(1)
            }
            return res;
        }
        exports.generate = gen;
    `);
    var body = res.body[2].declarations[0].init.properties;
    Object.keys(obj).forEach(function (kind) {
        body.push({
            type: 'Property',
            key: { type: 'Identifier', name: kind },
            value: {
                type: 'FunctionExpression',
                params: [{ type: 'Identifier', name: 'node' }],
                defaults: [],
                body: {
                    type: 'BlockStatement',
                    body: bodyGen(obj, kind)
                }
            }
        });
    });
    return res;
}

console.log(esotope.generate(funcObject(spec.visitorKeys)));
