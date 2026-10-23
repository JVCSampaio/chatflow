export default {
  paths: ['features/**/*.feature'],
  import: ['features/apoio/**/*.ts'],
  format: ['progress', 'html:reports/bdd.html', 'junit:reports/bdd-junit.xml'],
}
