# the annotated schema must match the literal's schema exactly
t :: Table<{a :: Number, b :: String}> = table: a, b row: 1, true end
