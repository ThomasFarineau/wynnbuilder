const path = require('path');
const _ = require('lodash');
const {readFileSync, writeFileSync} = require('node:fs');

const destination = path.join(__dirname, '..', 'src', 'generated');

require('dotenv').config();

const WYNNCRAFT_VERSION = process.env.WYNNCRAFT_VERSION;

const main = () => {
  const dataPath = path.join(__dirname, 'version', WYNNCRAFT_VERSION);
  const result = {};
  result['items'] = {};
  result['recipes'] = {};

  try {
    const itemsData = readFileSync(path.join(dataPath, 'items.json'));
    const recipesData = readFileSync(path.join(dataPath, 'recipes.json'));
    const metadataData = readFileSync(path.join(dataPath, 'metadata.json'));
    const data = readFileSync(path.join(__dirname, 'id_item_mapping.json'));

    const items = JSON.parse(itemsData);
    const idItemMapping = JSON.parse(data);
    const recipes = JSON.parse(recipesData);
    let parsedMetadata = JSON.parse(metadataData);

    let resultItems = {};
    let resultRecipes = {};

    _.keys(items).forEach((key) => {
      let k = _.camelCase(items[key]['internalName']);
      if (idItemMapping[k]) {
        items[key].name = key;
        items[key].internalName = k;
        delete items[key]['armorType'];
        delete items[key]['armorColor'];
        delete items[key]['material'];
        if (items[key]['accessoryType'])
          items[key].type = items[key]['accessoryType'];
        delete items[key]['accessoryType'];

        delete items[key]['identified'];
        delete items[key]['dropRestriction'];
        delete items[key]['dropMeta'];
        delete items[key]['restrictions'];
        delete items[key]['droppedBy'];

        resultItems[idItemMapping[k]] = items[key];
      }
    });

    _.flatten(recipes).forEach((recipe) => {
      recipe.materials = recipe.materials.map((material) => {
        const camelCasedItem = _.camelCase(material.item);
        const matchingKeys = _.sortBy(
          _.keys(idItemMapping).filter((key) => key.includes(camelCasedItem))
        );

        const marchingValues = matchingKeys.map((key) => idItemMapping[key]);

        return {
          ...material,
          item: [marchingValues]
        };
      });
      const id = recipe.id;
      delete recipe.id;
      resultRecipes[id] = recipe;
    });

    const sortedRecipes = _.fromPairs(
      _.sortBy(_.toPairs(resultRecipes), ([key]) => {
        const [name, num1, num2] = key.split('-');

        return [name, parseInt(num1, 2), parseInt(num2, 2)];
      })
    );

    result['items'] = resultItems;
    result['recipes'] = sortedRecipes;
    result['metadata'] = parsedMetadata;

    writeFileSync(
      path.join(destination, 'output.json'),
      JSON.stringify(result)
    );

    const identifications = {};
    _.forEach(
      parsedMetadata.identifications,
      (value) => (identifications[value] = transformIdentificationKey(value))
    );

    writeFileSync(
      path.join(destination, 'identifications.json'),
      JSON.stringify(identifications, null, 2)
    );
  } catch (err) {
    console.error(err);
    throw err;
  }
};

function transformIdentificationKey(key) {
  if (key.toLowerCase().startsWith('raw')) key = key.slice(3);
  if (key.toLowerCase().endsWith('raw')) key = key.slice(0, -3);

  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

main();
