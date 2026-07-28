include charts
include image
import color as C

# Coverage for the CHARTS module (lang/src/arr/trove/charts.arr -> charts-lib),
# which nothing else in this corpus touches.
#
# `include chart` resolves to code.pyret.org/src/web/arr/trove/chart.arr, a
# separate, older implementation backed by chart-lib. Every other program in
# this directory uses it, so the whole charts suite exercises chart-lib and
# never charts-lib -- including dot-chart-test.arr, which renders a categorical
# dot chart and passes happily on a real Safari 17.
#
# charts-lib is what the newer API and Bootstrap's decision-tree starter file
# reach (image-dot-chart(training, "species", animal-img)), and its
# categoricalDotChart does `rawCounts.entries().map(...)` -- an iterator-helpers
# call Safari did not ship until 18.4. On Safari 17 that throws
# "TypeError: ....map is not a function", which is what teachers hit on
# pyret.bootstrapworld.org.

species = [list: "cat", "dog", "cat", "snail", "dog", "cat", "rabbit"]

# Each image carries its own category name, so a saved image from a failing run
# shows which label landed where.
images = species.map(lam(s): text(s, 18, C.purple) end)

zoo = render-chart(from-list.image-dot-chart(images, species)).get-image()

check "Image dot chart, categorical data with image labels":
  zoo satisfies is-image
end
