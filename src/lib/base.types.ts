export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      aisle_order: {
        Row: {
          aisle: string
          household_id: string
          id: string
          position: number
          store_id: string
          updated_at: string
        }
        Insert: {
          aisle: string
          household_id: string
          id?: string
          position: number
          store_id: string
          updated_at?: string
        }
        Update: {
          aisle?: string
          household_id?: string
          id?: string
          position?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "aisle_order_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aisle_order_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "store"
            referencedColumns: ["id"]
          },
        ]
      }
      appliance_catalog: {
        Row: {
          code: string
          default_capacity: number
          id: string
          label: string
        }
        Insert: {
          code: string
          default_capacity?: number
          id?: string
          label: string
        }
        Update: {
          code?: string
          default_capacity?: number
          id?: string
          label?: string
        }
        Relationships: []
      }
      catalogue_charge: {
        Row: {
          id: string
          libelle: string
          ordre: number
          periode: string
          portee: string
          precision_txt: string | null
          section: string
        }
        Insert: {
          id?: string
          libelle: string
          ordre: number
          periode: string
          portee: string
          precision_txt?: string | null
          section: string
        }
        Update: {
          id?: string
          libelle?: string
          ordre?: number
          periode?: string
          portee?: string
          precision_txt?: string | null
          section?: string
        }
        Relationships: []
      }
      compte: {
        Row: {
          archive_le: string | null
          created_at: string
          genre: string
          household_id: string
          id: string
          matelas_cents: number
          nom: string
          titulaire_id: string | null
        }
        Insert: {
          archive_le?: string | null
          created_at?: string
          genre: string
          household_id: string
          id?: string
          matelas_cents?: number
          nom: string
          titulaire_id?: string | null
        }
        Update: {
          archive_le?: string | null
          created_at?: string
          genre?: string
          household_id?: string
          id?: string
          matelas_cents?: number
          nom?: string
          titulaire_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compte_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compte_titulaire_id_fkey"
            columns: ["titulaire_id"]
            isOneToOne: false
            referencedRelation: "user_profile"
            referencedColumns: ["id"]
          },
        ]
      }
      cycle: {
        Row: {
          budget_eur: number | null
          closed_at: string | null
          cook_at: string | null
          created_at: string
          household_id: string
          id: string
          servings_target: number
          started_at: string | null
          state: string
          week_of: string
        }
        Insert: {
          budget_eur?: number | null
          closed_at?: string | null
          cook_at?: string | null
          created_at?: string
          household_id: string
          id?: string
          servings_target?: number
          started_at?: string | null
          state?: string
          week_of: string
        }
        Update: {
          budget_eur?: number | null
          closed_at?: string | null
          cook_at?: string | null
          created_at?: string
          household_id?: string
          id?: string
          servings_target?: number
          started_at?: string | null
          state?: string
          week_of?: string
        }
        Relationships: [
          {
            foreignKeyName: "cycle_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      cycle_recipe: {
        Row: {
          created_at: string
          cycle_id: string
          household_id: string
          id: string
          position: number
          recipe_id: string
          servings: number
        }
        Insert: {
          created_at?: string
          cycle_id: string
          household_id: string
          id?: string
          position?: number
          recipe_id: string
          servings: number
        }
        Update: {
          created_at?: string
          cycle_id?: string
          household_id?: string
          id?: string
          position?: number
          recipe_id?: string
          servings?: number
        }
        Relationships: [
          {
            foreignKeyName: "cycle_recipe_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cycle_recipe_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cycle_recipe_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe"
            referencedColumns: ["id"]
          },
        ]
      }
      cycle_transition: {
        Row: {
          from_state: string
          to_state: string
        }
        Insert: {
          from_state: string
          to_state: string
        }
        Update: {
          from_state?: string
          to_state?: string
        }
        Relationships: []
      }
      default_duration: {
        Row: {
          appliance_type: string | null
          base_minutes: number
          id: string
          load_type: string
          scaling: string
          verb: string
        }
        Insert: {
          appliance_type?: string | null
          base_minutes: number
          id?: string
          load_type: string
          scaling?: string
          verb: string
        }
        Update: {
          appliance_type?: string | null
          base_minutes?: number
          id?: string
          load_type?: string
          scaling?: string
          verb?: string
        }
        Relationships: []
      }
      default_temperature: {
        Row: {
          id: string
          preparation: string
          temperature_c: number
        }
        Insert: {
          id?: string
          preparation: string
          temperature_c: number
        }
        Update: {
          id?: string
          preparation?: string
          temperature_c?: number
        }
        Relationships: []
      }
      density: {
        Row: {
          food_id: string
          grams_per_ml: number
        }
        Insert: {
          food_id: string
          grams_per_ml: number
        }
        Update: {
          food_id?: string
          grams_per_ml?: number
        }
        Relationships: [
          {
            foreignKeyName: "density_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: true
            referencedRelation: "food"
            referencedColumns: ["id"]
          },
        ]
      }
      duration_observation: {
        Row: {
          actual_min: number
          appliance_code: string | null
          household_id: string
          id: string
          observed_at: string
          planned_min: number
          quantity_g: number | null
          verb: string
        }
        Insert: {
          actual_min: number
          appliance_code?: string | null
          household_id: string
          id?: string
          observed_at?: string
          planned_min: number
          quantity_g?: number | null
          verb: string
        }
        Update: {
          actual_min?: number
          appliance_code?: string | null
          household_id?: string
          id?: string
          observed_at?: string
          planned_min?: number
          quantity_g?: number | null
          verb?: string
        }
        Relationships: [
          {
            foreignKeyName: "duration_observation_appliance_code_fkey"
            columns: ["appliance_code"]
            isOneToOne: false
            referencedRelation: "appliance_catalog"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "duration_observation_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      food: {
        Row: {
          ciqual_group: string | null
          ciqual_subgroup: string | null
          created_at: string
          id: string
          name: string
          nutrients: Json
          source: string
          source_code: string
          state: string
        }
        Insert: {
          ciqual_group?: string | null
          ciqual_subgroup?: string | null
          created_at?: string
          id?: string
          name: string
          nutrients?: Json
          source: string
          source_code: string
          state?: string
        }
        Update: {
          ciqual_group?: string | null
          ciqual_subgroup?: string | null
          created_at?: string
          id?: string
          name?: string
          nutrients?: Json
          source?: string
          source_code?: string
          state?: string
        }
        Relationships: []
      }
      food_yield_factor: {
        Row: {
          factor: number
          food_id: string
        }
        Insert: {
          factor: number
          food_id: string
        }
        Update: {
          factor?: number
          food_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_yield_factor_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: true
            referencedRelation: "food"
            referencedColumns: ["id"]
          },
        ]
      }
      foyer_ami: {
        Row: {
          accepte_le: string | null
          accepte_par: string | null
          created_at: string
          cree_par: string | null
          expire_le: string
          id: string
          invite_par: string
          jeton: string
        }
        Insert: {
          accepte_le?: string | null
          accepte_par?: string | null
          created_at?: string
          cree_par?: string | null
          expire_le?: string
          id?: string
          invite_par: string
          jeton?: string
        }
        Update: {
          accepte_le?: string | null
          accepte_par?: string | null
          created_at?: string
          cree_par?: string | null
          expire_le?: string
          id?: string
          invite_par?: string
          jeton?: string
        }
        Relationships: [
          {
            foreignKeyName: "foyer_ami_accepte_par_fkey"
            columns: ["accepte_par"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "foyer_ami_invite_par_fkey"
            columns: ["invite_par"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      frequent_food: {
        Row: {
          carb_g: number
          fat_g: number
          fiber_g: number
          food_id: string | null
          grams: number
          household_id: string
          id: string
          kcal: number
          label: string
          last_used_at: string | null
          protein_g: number
          times_used: number
        }
        Insert: {
          carb_g: number
          fat_g: number
          fiber_g: number
          food_id?: string | null
          grams: number
          household_id: string
          id?: string
          kcal: number
          label: string
          last_used_at?: string | null
          protein_g: number
          times_used?: number
        }
        Update: {
          carb_g?: number
          fat_g?: number
          fiber_g?: number
          food_id?: string | null
          grams?: number
          household_id?: string
          id?: string
          kcal?: number
          label?: string
          last_used_at?: string | null
          protein_g?: number
          times_used?: number
        }
        Relationships: [
          {
            foreignKeyName: "frequent_food_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "food"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "frequent_food_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      household: {
        Row: {
          created_at: string
          food_budget_eur: number | null
          id: string
          llm_monthly_cap_eur: number
          name: string
        }
        Insert: {
          created_at?: string
          food_budget_eur?: number | null
          id?: string
          llm_monthly_cap_eur?: number
          name: string
        }
        Update: {
          created_at?: string
          food_budget_eur?: number | null
          id?: string
          llm_monthly_cap_eur?: number
          name?: string
        }
        Relationships: []
      }
      household_ingredient_resolution: {
        Row: {
          food_id: string | null
          grams: number | null
          household_id: string
          recipe_ingredient_id: string
          updated_at: string
        }
        Insert: {
          food_id?: string | null
          grams?: number | null
          household_id: string
          recipe_ingredient_id: string
          updated_at?: string
        }
        Update: {
          food_id?: string | null
          grams?: number | null
          household_id?: string
          recipe_ingredient_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_ingredient_resolution_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "food"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_ingredient_resolution_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_ingredient_resolution_recipe_ingredient_id_fkey"
            columns: ["recipe_ingredient_id"]
            isOneToOne: false
            referencedRelation: "recipe_ingredient"
            referencedColumns: ["id"]
          },
        ]
      }
      household_price: {
        Row: {
          avg_price_eur: number
          food_id: string | null
          household_id: string
          id: string
          label: string
          last_price_eur: number
          last_seen_at: string
          observations: number
          store_id: string | null
          unit: string
        }
        Insert: {
          avg_price_eur: number
          food_id?: string | null
          household_id: string
          id?: string
          label: string
          last_price_eur: number
          last_seen_at?: string
          observations?: number
          store_id?: string | null
          unit?: string
        }
        Update: {
          avg_price_eur?: number
          food_id?: string | null
          household_id?: string
          id?: string
          label?: string
          last_price_eur?: number
          last_seen_at?: string
          observations?: number
          store_id?: string | null
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_price_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "food"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_price_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_price_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "store"
            referencedColumns: ["id"]
          },
        ]
      }
      household_unit_weight: {
        Row: {
          actif: boolean
          food_id: string
          grams: number
          household_id: string
          observations: number
          seuil: number
          unit_label: string
          updated_at: string
        }
        Insert: {
          actif?: boolean
          food_id: string
          grams: number
          household_id: string
          observations: number
          seuil: number
          unit_label: string
          updated_at?: string
        }
        Update: {
          actif?: boolean
          food_id?: string
          grams?: number
          household_id?: string
          observations?: number
          seuil?: number
          unit_label?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_unit_weight_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "food"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_unit_weight_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      ingestion_job: {
        Row: {
          attempts: number
          content_hash: string | null
          created_at: string
          error: string | null
          id: string
          state: string
          updated_at: string
          url: string
        }
        Insert: {
          attempts?: number
          content_hash?: string | null
          created_at?: string
          error?: string | null
          id?: string
          state?: string
          updated_at?: string
          url: string
        }
        Update: {
          attempts?: number
          content_hash?: string | null
          created_at?: string
          error?: string | null
          id?: string
          state?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      instance_setting: {
        Row: {
          key: string
          value: Json
        }
        Insert: {
          key: string
          value: Json
        }
        Update: {
          key?: string
          value?: Json
        }
        Relationships: []
      }
      invitation: {
        Row: {
          accepted_at: string | null
          created_at: string
          created_by: string | null
          email: string
          expires_at: string
          household_id: string
          id: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          expires_at?: string
          household_id: string
          id?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          expires_at?: string
          household_id?: string
          id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitation_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_usage: {
        Row: {
          calls: number
          cost_eur: number
          household_id: string | null
          id: string
          kind: string
          month: string
          updated_at: string
        }
        Insert: {
          calls?: number
          cost_eur?: number
          household_id?: string | null
          id?: string
          kind: string
          month: string
          updated_at?: string
        }
        Update: {
          calls?: number
          cost_eur?: number
          household_id?: string | null
          id?: string
          kind?: string
          month?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "llm_usage_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_extra: {
        Row: {
          carb_g: number
          created_at: string
          fat_g: number
          fiber_g: number
          food_id: string | null
          grams: number | null
          household_id: string
          id: string
          kcal: number
          label: string
          meal_slot_id: string
          protein_g: number
        }
        Insert: {
          carb_g?: number
          created_at?: string
          fat_g?: number
          fiber_g?: number
          food_id?: string | null
          grams?: number | null
          household_id: string
          id?: string
          kcal?: number
          label: string
          meal_slot_id: string
          protein_g?: number
        }
        Update: {
          carb_g?: number
          created_at?: string
          fat_g?: number
          fiber_g?: number
          food_id?: string | null
          grams?: number | null
          household_id?: string
          id?: string
          kcal?: number
          label?: string
          meal_slot_id?: string
          protein_g?: number
        }
        Relationships: [
          {
            foreignKeyName: "meal_extra_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "food"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_extra_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_extra_meal_slot_id_fkey"
            columns: ["meal_slot_id"]
            isOneToOne: false
            referencedRelation: "meal_slot"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_slot: {
        Row: {
          cycle_id: string | null
          day: string
          eaten_at: string | null
          household_id: string
          id: string
          meal: string
          portion_id: string | null
          state: string
          user_profile_id: string
        }
        Insert: {
          cycle_id?: string | null
          day: string
          eaten_at?: string | null
          household_id: string
          id?: string
          meal: string
          portion_id?: string | null
          state?: string
          user_profile_id: string
        }
        Update: {
          cycle_id?: string | null
          day?: string
          eaten_at?: string | null
          household_id?: string
          id?: string
          meal?: string
          portion_id?: string | null
          state?: string
          user_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_slot_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_slot_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_slot_portion_id_fkey"
            columns: ["portion_id"]
            isOneToOne: false
            referencedRelation: "portion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_slot_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profile"
            referencedColumns: ["id"]
          },
        ]
      }
      non_action_pattern: {
        Row: {
          note: string | null
          pattern: string
        }
        Insert: {
          note?: string | null
          pattern: string
        }
        Update: {
          note?: string | null
          pattern?: string
        }
        Relationships: []
      }
      nutrition_target: {
        Row: {
          carb_g: number
          fat_g: number
          fiber_g: number
          household_id: string
          id: string
          kcal: number
          protein_g: number
          user_profile_id: string
          valid_from: string
        }
        Insert: {
          carb_g: number
          fat_g: number
          fiber_g: number
          household_id: string
          id?: string
          kcal: number
          protein_g: number
          user_profile_id: string
          valid_from?: string
        }
        Update: {
          carb_g?: number
          fat_g?: number
          fiber_g?: number
          household_id?: string
          id?: string
          kcal?: number
          protein_g?: number
          user_profile_id?: string
          valid_from?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_target_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_target_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profile"
            referencedColumns: ["id"]
          },
        ]
      }
      portion: {
        Row: {
          carb_g: number
          cost_eur: number | null
          created_at: string
          cycle_id: string | null
          expires_at: string
          fat_g: number
          fiber_g: number
          for_user_id: string | null
          frozen_at: string | null
          grams: number
          household_id: string
          id: string
          kcal: number
          kcal_margin: number | null
          label: string
          location: string
          prepared_at: string
          protein_g: number
          protein_g_margin: number | null
          recipe_id: string | null
          source: string
          state: string
        }
        Insert: {
          carb_g: number
          cost_eur?: number | null
          created_at?: string
          cycle_id?: string | null
          expires_at: string
          fat_g: number
          fiber_g: number
          for_user_id?: string | null
          frozen_at?: string | null
          grams: number
          household_id: string
          id?: string
          kcal: number
          kcal_margin?: number | null
          label: string
          location?: string
          prepared_at?: string
          protein_g: number
          protein_g_margin?: number | null
          recipe_id?: string | null
          source?: string
          state?: string
        }
        Update: {
          carb_g?: number
          cost_eur?: number | null
          created_at?: string
          cycle_id?: string | null
          expires_at?: string
          fat_g?: number
          fiber_g?: number
          for_user_id?: string | null
          frozen_at?: string | null
          grams?: number
          household_id?: string
          id?: string
          kcal?: number
          kcal_margin?: number | null
          label?: string
          location?: string
          prepared_at?: string
          protein_g?: number
          protein_g_margin?: number | null
          recipe_id?: string | null
          source?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "portion_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portion_for_user_id_fkey"
            columns: ["for_user_id"]
            isOneToOne: false
            referencedRelation: "user_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portion_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portion_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe"
            referencedColumns: ["id"]
          },
        ]
      }
      portion_event: {
        Row: {
          at: string
          by_user_id: string | null
          household_id: string
          id: string
          kind: string
          note: string | null
          portion_id: string
        }
        Insert: {
          at?: string
          by_user_id?: string | null
          household_id: string
          id?: string
          kind: string
          note?: string | null
          portion_id: string
        }
        Update: {
          at?: string
          by_user_id?: string | null
          household_id?: string
          id?: string
          kind?: string
          note?: string | null
          portion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portion_event_by_user_id_fkey"
            columns: ["by_user_id"]
            isOneToOne: false
            referencedRelation: "user_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portion_event_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portion_event_portion_id_fkey"
            columns: ["portion_id"]
            isOneToOne: false
            referencedRelation: "portion"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt: {
        Row: {
          bought_at: string
          created_at: string
          household_id: string
          id: string
          raw: Json | null
          store_id: string | null
          total_eur: number | null
          trip_id: string | null
        }
        Insert: {
          bought_at?: string
          created_at?: string
          household_id: string
          id?: string
          raw?: Json | null
          store_id?: string | null
          total_eur?: number | null
          trip_id?: string | null
        }
        Update: {
          bought_at?: string
          created_at?: string
          household_id?: string
          id?: string
          raw?: Json | null
          store_id?: string | null
          total_eur?: number | null
          trip_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receipt_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "store"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "shopping_trip"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_line: {
        Row: {
          confidence: number
          food_id: string | null
          household_id: string
          id: string
          label: string
          price_eur: number
          quantity: number | null
          receipt_id: string
          shopping_item_id: string | null
          unit: string | null
        }
        Insert: {
          confidence?: number
          food_id?: string | null
          household_id: string
          id?: string
          label: string
          price_eur: number
          quantity?: number | null
          receipt_id: string
          shopping_item_id?: string | null
          unit?: string | null
        }
        Update: {
          confidence?: number
          food_id?: string | null
          household_id?: string
          id?: string
          label?: string
          price_eur?: number
          quantity?: number | null
          receipt_id?: string
          shopping_item_id?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receipt_line_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "food"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_line_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_line_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipt"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_line_shopping_item_id_fkey"
            columns: ["shopping_item_id"]
            isOneToOne: false
            referencedRelation: "shopping_item"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe: {
        Row: {
          active_time_min: number | null
          appliances: string[]
          cook_time_min: number | null
          created_at: string
          created_by: string | null
          edited_at: string | null
          edited_by_household_id: string | null
          freezable: boolean | null
          id: string
          import_note: string | null
          license_note: string | null
          origin: string
          owner_household_id: string | null
          plannable: boolean
          prep_time_min: number | null
          source_name: string | null
          source_url: string | null
          step_count: number
          title: string | null
          total_time_min: number | null
          visibility: string
          yield_servings: number | null
        }
        Insert: {
          active_time_min?: number | null
          appliances?: string[]
          cook_time_min?: number | null
          created_at?: string
          created_by?: string | null
          edited_at?: string | null
          edited_by_household_id?: string | null
          freezable?: boolean | null
          id?: string
          import_note?: string | null
          license_note?: string | null
          origin?: string
          owner_household_id?: string | null
          plannable?: boolean
          prep_time_min?: number | null
          source_name?: string | null
          source_url?: string | null
          step_count?: number
          title?: string | null
          total_time_min?: number | null
          visibility?: string
          yield_servings?: number | null
        }
        Update: {
          active_time_min?: number | null
          appliances?: string[]
          cook_time_min?: number | null
          created_at?: string
          created_by?: string | null
          edited_at?: string | null
          edited_by_household_id?: string | null
          freezable?: boolean | null
          id?: string
          import_note?: string | null
          license_note?: string | null
          origin?: string
          owner_household_id?: string | null
          plannable?: boolean
          prep_time_min?: number | null
          source_name?: string | null
          source_url?: string | null
          step_count?: number
          title?: string | null
          total_time_min?: number | null
          visibility?: string
          yield_servings?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profile"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_ingredient: {
        Row: {
          confidence: number | null
          edited_at: string | null
          edited_by_household_id: string | null
          food_id: string | null
          grams_reference: number | null
          id: string
          ordinal: number
          qty: number | null
          raw_text: string
          recipe_id: string
          resolution_source: string | null
          unit: string | null
        }
        Insert: {
          confidence?: number | null
          edited_at?: string | null
          edited_by_household_id?: string | null
          food_id?: string | null
          grams_reference?: number | null
          id?: string
          ordinal: number
          qty?: number | null
          raw_text: string
          recipe_id: string
          resolution_source?: string | null
          unit?: string | null
        }
        Update: {
          confidence?: number | null
          edited_at?: string | null
          edited_by_household_id?: string | null
          food_id?: string | null
          grams_reference?: number | null
          id?: string
          ordinal?: number
          qty?: number | null
          raw_text?: string
          recipe_id?: string
          resolution_source?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredient_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "food"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredient_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_nutrition: {
        Row: {
          carb_g: number
          computed_at: string
          coverage: number
          fat_g: number
          fiber_g: number
          grams: number
          kcal: number
          kcal_margin: number
          kcal_max: number | null
          protein_g: number
          protein_g_margin: number
          protein_g_min: number | null
          recipe_id: string
        }
        Insert: {
          carb_g: number
          computed_at?: string
          coverage: number
          fat_g: number
          fiber_g: number
          grams: number
          kcal: number
          kcal_margin?: number
          kcal_max?: number | null
          protein_g: number
          protein_g_margin?: number
          protein_g_min?: number | null
          recipe_id: string
        }
        Update: {
          carb_g?: number
          computed_at?: string
          coverage?: number
          fat_g?: number
          fiber_g?: number
          grams?: number
          kcal?: number
          kcal_margin?: number
          kcal_max?: number | null
          protein_g?: number
          protein_g_margin?: number
          protein_g_min?: number | null
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_nutrition_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: true
            referencedRelation: "recipe"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_step: {
        Row: {
          appliance_type: string | null
          confidence: number | null
          duration_min: number | null
          duration_source: string | null
          edited_at: string | null
          edited_by_household_id: string | null
          id: string
          load_type: string | null
          ordinal: number
          quantity_g: number | null
          recipe_id: string
          temperature_c: number | null
          temperature_source: string | null
          text: string
          verb: string | null
        }
        Insert: {
          appliance_type?: string | null
          confidence?: number | null
          duration_min?: number | null
          duration_source?: string | null
          edited_at?: string | null
          edited_by_household_id?: string | null
          id?: string
          load_type?: string | null
          ordinal: number
          quantity_g?: number | null
          recipe_id: string
          temperature_c?: number | null
          temperature_source?: string | null
          text: string
          verb?: string | null
        }
        Update: {
          appliance_type?: string | null
          confidence?: number | null
          duration_min?: number | null
          duration_source?: string | null
          edited_at?: string | null
          edited_by_household_id?: string | null
          id?: string
          load_type?: string | null
          ordinal?: number
          quantity_g?: number | null
          recipe_id?: string
          temperature_c?: number | null
          temperature_source?: string | null
          text?: string
          verb?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_step_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_step_dependency: {
        Row: {
          after_id: string
          before_id: string
          edited_at: string | null
          edited_by_household_id: string | null
          origin: string
        }
        Insert: {
          after_id: string
          before_id: string
          edited_at?: string | null
          edited_by_household_id?: string | null
          origin?: string
        }
        Update: {
          after_id?: string
          before_id?: string
          edited_at?: string | null
          edited_by_household_id?: string | null
          origin?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_step_dependency_after_id_fkey"
            columns: ["after_id"]
            isOneToOne: false
            referencedRelation: "recipe_step"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_step_dependency_before_id_fkey"
            columns: ["before_id"]
            isOneToOne: false
            referencedRelation: "recipe_step"
            referencedColumns: ["id"]
          },
        ]
      }
      regle_partage: {
        Row: {
          cle: string
          created_at: string
          household_id: string
          id: string
          valid_from: string
        }
        Insert: {
          cle: string
          created_at?: string
          household_id: string
          id?: string
          valid_from: string
        }
        Update: {
          cle?: string
          created_at?: string
          household_id?: string
          id?: string
          valid_from?: string
        }
        Relationships: [
          {
            foreignKeyName: "regle_partage_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      revenu: {
        Row: {
          created_at: string
          household_id: string
          id: string
          net_mensuel_cents: number
          user_profile_id: string
          valid_from: string
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          net_mensuel_cents: number
          user_profile_id: string
          valid_from: string
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          net_mensuel_cents?: number
          user_profile_id?: string
          valid_from?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenu_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenu_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profile"
            referencedColumns: ["id"]
          },
        ]
      }
      session_appliance: {
        Row: {
          appliance_code: string
          capacity: number
          cycle_id: string
          household_id: string
          id: string
        }
        Insert: {
          appliance_code: string
          capacity?: number
          cycle_id: string
          household_id: string
          id?: string
        }
        Update: {
          appliance_code?: string
          capacity?: number
          cycle_id?: string
          household_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_appliance_appliance_code_fkey"
            columns: ["appliance_code"]
            isOneToOne: false
            referencedRelation: "appliance_catalog"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "session_appliance_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_appliance_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      session_convive: {
        Row: {
          created_at: string
          cycle_id: string
          hote_id: string
          id: string
          invite_id: string
          invite_le: string
          rejoint_le: string | null
        }
        Insert: {
          created_at?: string
          cycle_id: string
          hote_id: string
          id?: string
          invite_id: string
          invite_le?: string
          rejoint_le?: string | null
        }
        Update: {
          created_at?: string
          cycle_id?: string
          hote_id?: string
          id?: string
          invite_id?: string
          invite_le?: string
          rejoint_le?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_convive_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_convive_hote_id_fkey"
            columns: ["hote_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_convive_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      session_task: {
        Row: {
          actual_min: number | null
          appliance_code: string | null
          assignee_id: string | null
          created_at: string
          cycle_id: string
          done_at: string | null
          duration_min: number
          household_id: string
          id: string
          is_active: boolean
          label: string
          planned_start_min: number
          position: number
          quantity_g: number | null
          started_at: string | null
          verb: string | null
        }
        Insert: {
          actual_min?: number | null
          appliance_code?: string | null
          assignee_id?: string | null
          created_at?: string
          cycle_id: string
          done_at?: string | null
          duration_min: number
          household_id: string
          id?: string
          is_active?: boolean
          label: string
          planned_start_min: number
          position?: number
          quantity_g?: number | null
          started_at?: string | null
          verb?: string | null
        }
        Update: {
          actual_min?: number | null
          appliance_code?: string | null
          assignee_id?: string | null
          created_at?: string
          cycle_id?: string
          done_at?: string | null
          duration_min?: number
          household_id?: string
          id?: string
          is_active?: boolean
          label?: string
          planned_start_min?: number
          position?: number
          quantity_g?: number | null
          started_at?: string | null
          verb?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_task_appliance_code_fkey"
            columns: ["appliance_code"]
            isOneToOne: false
            referencedRelation: "appliance_catalog"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "session_task_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "user_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_task_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_task_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      session_task_dependency: {
        Row: {
          depends_on_id: string
          household_id: string
          task_id: string
        }
        Insert: {
          depends_on_id: string
          household_id: string
          task_id: string
        }
        Update: {
          depends_on_id?: string
          household_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_task_dependency_depends_on_id_fkey"
            columns: ["depends_on_id"]
            isOneToOne: false
            referencedRelation: "session_task"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_task_dependency_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_task_dependency_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "session_task"
            referencedColumns: ["id"]
          },
        ]
      }
      session_task_recipe: {
        Row: {
          household_id: string
          recipe_id: string
          task_id: string
        }
        Insert: {
          household_id: string
          recipe_id: string
          task_id: string
        }
        Update: {
          household_id?: string
          recipe_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_task_recipe_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_task_recipe_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_task_recipe_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "session_task"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_habit: {
        Row: {
          food_id: string | null
          household_id: string
          id: string
          label: string
          last_added_at: string
          store_id: string | null
          times_added: number
        }
        Insert: {
          food_id?: string | null
          household_id: string
          id?: string
          label: string
          last_added_at?: string
          store_id?: string | null
          times_added?: number
        }
        Update: {
          food_id?: string | null
          household_id?: string
          id?: string
          label?: string
          last_added_at?: string
          store_id?: string | null
          times_added?: number
        }
        Relationships: [
          {
            foreignKeyName: "shopping_habit_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "food"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_habit_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_habit_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "store"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_item: {
        Row: {
          aisle: string | null
          checked_at: string | null
          checked_rank: number | null
          created_at: string
          cycle_id: string | null
          est_price_eur: number | null
          food_id: string | null
          household_id: string
          id: string
          label: string
          note: string | null
          paid_price_eur: number | null
          quantity: number | null
          source: string
          store_id: string | null
          unit: string | null
        }
        Insert: {
          aisle?: string | null
          checked_at?: string | null
          checked_rank?: number | null
          created_at?: string
          cycle_id?: string | null
          est_price_eur?: number | null
          food_id?: string | null
          household_id: string
          id?: string
          label: string
          note?: string | null
          paid_price_eur?: number | null
          quantity?: number | null
          source?: string
          store_id?: string | null
          unit?: string | null
        }
        Update: {
          aisle?: string | null
          checked_at?: string | null
          checked_rank?: number | null
          created_at?: string
          cycle_id?: string | null
          est_price_eur?: number | null
          food_id?: string | null
          household_id?: string
          id?: string
          label?: string
          note?: string | null
          paid_price_eur?: number | null
          quantity?: number | null
          source?: string
          store_id?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopping_item_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_item_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "food"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_item_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_item_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "store"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_trip: {
        Row: {
          cycle_id: string
          finished_at: string | null
          household_id: string
          id: string
          started_at: string
          store_id: string
          total_eur: number | null
        }
        Insert: {
          cycle_id: string
          finished_at?: string | null
          household_id: string
          id?: string
          started_at?: string
          store_id: string
          total_eur?: number | null
        }
        Update: {
          cycle_id?: string
          finished_at?: string | null
          household_id?: string
          id?: string
          started_at?: string
          store_id?: string
          total_eur?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shopping_trip_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_trip_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_trip_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "store"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_item: {
        Row: {
          created_at: string
          expires_at: string | null
          food_id: string | null
          frozen_at: string | null
          household_id: string
          id: string
          label: string
          location: string
          quantity: number | null
          shopping_item_id: string | null
          source: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          food_id?: string | null
          frozen_at?: string | null
          household_id: string
          id?: string
          label: string
          location?: string
          quantity?: number | null
          shopping_item_id?: string | null
          source?: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          food_id?: string | null
          frozen_at?: string | null
          household_id?: string
          id?: string
          label?: string
          location?: string
          quantity?: number | null
          shopping_item_id?: string | null
          source?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_item_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "food"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_item_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_item_shopping_item_id_fkey"
            columns: ["shopping_item_id"]
            isOneToOne: false
            referencedRelation: "shopping_item"
            referencedColumns: ["id"]
          },
        ]
      }
      store: {
        Row: {
          created_at: string
          household_id: string
          id: string
          is_default: boolean
          name: string
          position: number
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          is_default?: boolean
          name: string
          position?: number
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          is_default?: boolean
          name?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "store_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      suggested_item: {
        Row: {
          category: string
          id: string
          label: string
          position: number
        }
        Insert: {
          category: string
          id?: string
          label: string
          position?: number
        }
        Update: {
          category?: string
          id?: string
          label?: string
          position?: number
        }
        Relationships: []
      }
      typical_quantity: {
        Row: {
          ciqual_subgroup: string
          grams: number
        }
        Insert: {
          ciqual_subgroup: string
          grams: number
        }
        Update: {
          ciqual_subgroup?: string
          grams?: number
        }
        Relationships: []
      }
      unit_conversion: {
        Row: {
          ciqual_subgroup: string | null
          grams: number
          id: string
          unit_label: string
        }
        Insert: {
          ciqual_subgroup?: string | null
          grams: number
          id?: string
          unit_label: string
        }
        Update: {
          ciqual_subgroup?: string | null
          grams?: number
          id?: string
          unit_label?: string
        }
        Relationships: []
      }
      unit_weight: {
        Row: {
          confidence: number
          food_id: string | null
          grams: number
          id: string
          label: string
          source: string
        }
        Insert: {
          confidence?: number
          food_id?: string | null
          grams: number
          id?: string
          label: string
          source?: string
        }
        Update: {
          confidence?: number
          food_id?: string | null
          grams?: number
          id?: string
          label?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_weight_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "food"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profile: {
        Row: {
          created_at: string
          display_name: string
          entre_le: string
          household_id: string
          id: string
          password_set: boolean
        }
        Insert: {
          created_at?: string
          display_name: string
          entre_le?: string
          household_id: string
          id: string
          password_set?: boolean
        }
        Update: {
          created_at?: string
          display_name?: string
          entre_le?: string
          household_id?: string
          id?: string
          password_set?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "user_profile_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      verbe_alias: {
        Row: {
          depuis: string
          vers: string
        }
        Insert: {
          depuis: string
          vers: string
        }
        Update: {
          depuis?: string
          vers?: string
        }
        Relationships: []
      }
      weighing: {
        Row: {
          at: string
          cycle_id: string | null
          food_id: string
          grams: number
          household_id: string
          id: string
          qty_observed: number
          recipe_ingredient_id: string | null
          unit_observed: string
        }
        Insert: {
          at?: string
          cycle_id?: string | null
          food_id: string
          grams: number
          household_id: string
          id?: string
          qty_observed: number
          recipe_ingredient_id?: string | null
          unit_observed: string
        }
        Update: {
          at?: string
          cycle_id?: string | null
          food_id?: string
          grams?: number
          household_id?: string
          id?: string
          qty_observed?: number
          recipe_ingredient_id?: string | null
          unit_observed?: string
        }
        Relationships: [
          {
            foreignKeyName: "weighing_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "cycle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weighing_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "food"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weighing_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weighing_recipe_ingredient_id_fkey"
            columns: ["recipe_ingredient_id"]
            isOneToOne: false
            referencedRelation: "recipe_ingredient"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      nutrition_target_courante: {
        Row: {
          carb_g: number | null
          fat_g: number | null
          fiber_g: number | null
          household_id: string | null
          id: string | null
          kcal: number | null
          protein_g: number | null
          user_profile_id: string | null
          valid_from: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_target_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_target_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profile"
            referencedColumns: ["id"]
          },
        ]
      }
      price_knowledge: {
        Row: {
          avg_price_eur: number | null
          food_id: string | null
          household_id: string | null
          label: string | null
          last_price_eur: number | null
          last_seen_at: string | null
          observations: number | null
          store_id: string | null
          store_name: string | null
          unit: string | null
        }
        Relationships: [
          {
            foreignKeyName: "household_price_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "food"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_price_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_price_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "store"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accepter_amitie: { Args: { p_jeton: string }; Returns: string }
      arc_corrigible: {
        Args: { apres: string; avant: string }
        Returns: boolean
      }
      arc_sien: { Args: { apres: string; avant: string }; Returns: boolean }
      create_household: { Args: { p_name: string }; Returns: string }
      current_cycle: { Args: never; Returns: string }
      current_household: { Args: never; Returns: string }
      delete_my_account: { Args: never; Returns: undefined }
      export_my_data: { Args: never; Returns: Json }
      export_my_data_base: { Args: never; Returns: Json }
      foyers_amis: { Args: never; Returns: string[] }
      invitations_de_session: {
        Args: never
        Returns: {
          cycle_id: string
          hote_id: string
          id: string
          rejoint: boolean
        }[]
      }
      is_service_role: { Args: never; Returns: boolean }
      lieu_du_rayon: { Args: { rayon: string }; Returns: string }
      llm_budget_remaining: { Args: never; Returns: number }
      llm_consomme: {
        Args: { p_household: string; p_kind: string }
        Returns: number
      }
      llm_global_budget_remaining: { Args: never; Returns: number }
      open_cycle: {
        Args: { p_servings?: number; p_week_of: string }
        Returns: string
      }
      parts_du_foyer: {
        Args: { le_foyer?: string; le_mois: string }
        Returns: {
          part_bps: number
          user_profile_id: string
        }[]
      }
      poids_unitaire: {
        Args: { p_food_id: string; p_unit?: string }
        Returns: number
      }
      prenoms_visibles: {
        Args: never
        Returns: {
          display_name: string
          household_id: string
          id: string
        }[]
      }
      recettes_partagees: { Args: never; Returns: string[] }
      sessions_partagees: { Args: never; Returns: string[] }
      tables_de_foyer: {
        Args: never
        Returns: {
          table_name: string
        }[]
      }
      taches_partagees: { Args: never; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

