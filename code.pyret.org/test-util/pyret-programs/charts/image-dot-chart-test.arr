include chart
include image
import color as C
include math

# Regression coverage for the categorical dot chart WITH image labels -- the
# shape Bootstrap's decision-tree starter file uses via
# `image-dot-chart(training, "species", animal-img)`, and the one teachers hit
# on pyret.bootstrapworld.org.
#
# dot-chart-test.arr already covers `from-list.dot-chart`, but only without
# images: image-dot-chart-from-list is dot-chart-from-list(...).image-labels(...),
# so the image-carrying path had no coverage at all. Both land in charts-lib's
# categoricalDotChart, whose `rawCounts.entries().map(...)` needs the
# iterator-helpers proposal that Safari did not ship until 18.4 -- on Safari 17
# it throws "TypeError: ....map is not a function".

species = [list: "cat", "dog", "cat", "snail", "dog", "cat", "rabbit"]

fun animal-img(s):
  ask:
    | s == "cat"    then: circle(12, "solid", "orange")
    | s == "dog"    then: square(20, "solid", "brown")
    | s == "snail"  then: triangle(18, "solid", "green")
    | otherwise:          star(14, "solid", "purple")
  end
end

images = species.map(animal-img)

zoo-series = from-list.image-dot-chart(images, species)
zoo = render-chart(zoo-series).get-image()

check "Image dot chart, categorical data with image labels":
  zoo satisfies is-image
end
