/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const { withInfoPlist } = require('expo/config-plugins');
const { withBuildSourceFile } = require('@expo/config-plugins/build/ios/XcodeProjectFile');

module.exports = function withTskSiri(config) {
  config = withInfoPlist(config, mod => {
    mod.modResults.NSSiriUsageDescription = 'Use a Siri para lançar despesas no Agente TSK.';
    mod.modResults.CFBundleSpokenName = 'Agente TSK';
    mod.modResults.INAlternativeAppNames = [{ INAlternativeAppName: 'Agente', INAlternativeAppNamePronunciationHint: 'Agente' }];
    return mod;
  });
  return withBuildSourceFile(config, {
    filePath: 'RecordExpenseIntent.swift',
    contents: fs.readFileSync(path.join(__dirname, '../native/ios/RecordExpenseIntent.swift'), 'utf8'),
    overwrite: true,
  });
};
