
CREATE TABLE public.app_settings (
    key character varying(50) NOT NULL,
    value text
);

CREATE TABLE public.categories (
    id integer NOT NULL,
    name text,
    created_at timestamp without time zone DEFAULT now(),
    sort_order integer,
    active boolean DEFAULT true,
    product_sort character varying(20) DEFAULT 'az'::character varying,
    subcategory_order text,
    adult boolean DEFAULT false
);

CREATE SEQUENCE public.categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.categories_id_seq OWNED BY public.categories.id;

CREATE TABLE public.coupons (
    id integer NOT NULL,
    code character varying(30) NOT NULL,
    type character varying(10) DEFAULT 'percent'::character varying NOT NULL,
    value numeric(10,2) NOT NULL,
    min_order numeric(10,2) DEFAULT 0,
    max_uses integer,
    uses integer DEFAULT 0,
    expires_at date,
    active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

CREATE SEQUENCE public.coupons_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.coupons_id_seq OWNED BY public.coupons.id;

CREATE TABLE public.customers (
    id integer NOT NULL,
    name character varying(100),
    username text,
    email text,
    password text,
    phone_number text,
    address text,
    neighborhood text,
    role character varying(20) DEFAULT 'client'::text,
    created_at timestamp without time zone DEFAULT now(),
    active boolean DEFAULT true,
    avatar_url text,
    online boolean DEFAULT false,
    last_lat numeric(9,6),
    last_lng numeric(9,6),
    last_location_at timestamp without time zone
);

CREATE SEQUENCE public.customers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.customers_id_seq OWNED BY public.customers.id;

CREATE TABLE public.delivery_fees (
    id integer NOT NULL,
    neighborhood character varying(100) NOT NULL,
    fee numeric(10,2) NOT NULL
);

CREATE SEQUENCE public.delivery_fees_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.delivery_fees_id_seq OWNED BY public.delivery_fees.id;

CREATE TABLE public.media_files (
    id integer NOT NULL,
    name text NOT NULL,
    url text NOT NULL,
    public_id text NOT NULL,
    resource_type character varying(20) DEFAULT 'image'::character varying,
    format character varying(20),
    bytes integer,
    width integer,
    height integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

CREATE SEQUENCE public.media_files_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.media_files_id_seq OWNED BY public.media_files.id;

CREATE TABLE public.order_items (
    id integer NOT NULL,
    order_id integer,
    product_id integer,
    quantity numeric(10,3),
    price numeric(10,2)
);

CREATE SEQUENCE public.order_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.order_items_id_seq OWNED BY public.order_items.id;

CREATE TABLE public.orders (
    id integer NOT NULL,
    customer_id integer,
    total numeric(10,2),
    status character varying(50),
    created_at timestamp without time zone DEFAULT now(),
    motoboy_id integer,
    delivered_at timestamp without time zone,
    delivery_address text,
    payment_method character varying(20) DEFAULT 'dinheiro'::character varying,
    delivery_fee numeric(10,2) DEFAULT 0,
    delivery_neighborhood text,
    discount numeric(10,2) DEFAULT 0,
    coupon_code character varying(30),
    change_for numeric(10,2),
    notes text,
    rating smallint,
    rating_comment text,
    rated_at timestamp without time zone,
    out_at timestamp without time zone,
    settled_at timestamp without time zone,
    problem text,
    problem_at timestamp without time zone,
    payment_note character varying(200)
);

CREATE SEQUENCE public.orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.orders_id_seq OWNED BY public.orders.id;

CREATE TABLE public.product_schedules (
    id integer NOT NULL,
    product_id integer NOT NULL,
    kind character varying(20) NOT NULL,
    promo_price numeric(10,2),
    start_at character varying(16),
    end_at character varying(16),
    weekdays character varying(20),
    time_from character varying(5),
    time_to character varying(5),
    active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

CREATE SEQUENCE public.product_schedules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.product_schedules_id_seq OWNED BY public.product_schedules.id;

CREATE TABLE public.product_stock_config (
    id integer NOT NULL,
    product_id integer,
    type character varying(20) DEFAULT 'MANUAL'::character varying,
    auto_quantity numeric(10,3) DEFAULT 50,
    auto_frequency character varying(20) DEFAULT 'SEMANAL'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    last_restocked_at timestamp with time zone
);

CREATE SEQUENCE public.product_stock_config_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.product_stock_config_id_seq OWNED BY public.product_stock_config.id;

CREATE TABLE public.products (
    id integer NOT NULL,
    name text,
    price numeric(10,2),
    unit text,
    category_id integer,
    image_url text,
    estoque numeric(10,3) DEFAULT 0,
    promo_price numeric(10,2),
    description text,
    active boolean DEFAULT true,
    sort_order integer,
    subcategory character varying(60),
    barcode character varying(32),
    adult boolean DEFAULT false
);

CREATE SEQUENCE public.products_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.products_id_seq OWNED BY public.products.id;

CREATE TABLE public.push_subscriptions (
    id integer NOT NULL,
    customer_id integer,
    endpoint text NOT NULL,
    keys text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

CREATE SEQUENCE public.push_subscriptions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.push_subscriptions_id_seq OWNED BY public.push_subscriptions.id;

ALTER TABLE ONLY public.categories ALTER COLUMN id SET DEFAULT nextval('public.categories_id_seq'::regclass);

ALTER TABLE ONLY public.coupons ALTER COLUMN id SET DEFAULT nextval('public.coupons_id_seq'::regclass);

ALTER TABLE ONLY public.customers ALTER COLUMN id SET DEFAULT nextval('public.customers_id_seq'::regclass);

ALTER TABLE ONLY public.delivery_fees ALTER COLUMN id SET DEFAULT nextval('public.delivery_fees_id_seq'::regclass);

ALTER TABLE ONLY public.media_files ALTER COLUMN id SET DEFAULT nextval('public.media_files_id_seq'::regclass);

ALTER TABLE ONLY public.order_items ALTER COLUMN id SET DEFAULT nextval('public.order_items_id_seq'::regclass);

ALTER TABLE ONLY public.orders ALTER COLUMN id SET DEFAULT nextval('public.orders_id_seq'::regclass);

ALTER TABLE ONLY public.product_schedules ALTER COLUMN id SET DEFAULT nextval('public.product_schedules_id_seq'::regclass);

ALTER TABLE ONLY public.product_stock_config ALTER COLUMN id SET DEFAULT nextval('public.product_stock_config_id_seq'::regclass);

ALTER TABLE ONLY public.products ALTER COLUMN id SET DEFAULT nextval('public.products_id_seq'::regclass);

ALTER TABLE ONLY public.push_subscriptions ALTER COLUMN id SET DEFAULT nextval('public.push_subscriptions_id_seq'::regclass);

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_code_key UNIQUE (code);

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.delivery_fees
    ADD CONSTRAINT delivery_fees_neighborhood_key UNIQUE (neighborhood);

ALTER TABLE ONLY public.delivery_fees
    ADD CONSTRAINT delivery_fees_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.media_files
    ADD CONSTRAINT media_files_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.product_schedules
    ADD CONSTRAINT product_schedules_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.product_stock_config
    ADD CONSTRAINT product_stock_config_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.product_stock_config
    ADD CONSTRAINT product_stock_config_product_id_key UNIQUE (product_id);

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);

CREATE INDEX products_barcode ON public.products USING btree (barcode);

CREATE UNIQUE INDEX push_subscriptions_endpoint_customer ON public.push_subscriptions USING btree (endpoint, customer_id);

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id);

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_motoboy_id_fkey FOREIGN KEY (motoboy_id) REFERENCES public.customers(id);

ALTER TABLE ONLY public.product_schedules
    ADD CONSTRAINT product_schedules_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.product_stock_config
    ADD CONSTRAINT product_stock_config_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id);

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;

